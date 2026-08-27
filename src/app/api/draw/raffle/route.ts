import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  ensureDefaultTokenshitRaffle,
  countRaffleEntries,
  listRaffleEntries,
  isWalletEntered,
  registerRaffleEntry,
  getAllRaffleWallets,
  markRaffleDrawn,
  saveVrfDraw,
  initDb,
  getFairRaffleBySlug,
  getFairRaffleById,
  listOpenFairRaffles,
  createFairRaffle,
  markRaffleFunded,
  delayFairRaffle,
  cancelFairRaffle,
  type FairRaffleRow,
} from "@/lib/db";
import { hashEntries, indexFromSeed, makeDrawId, sha256Hex } from "@/lib/vrf";
import { mainnetRpcUrl } from "@/lib/rpc-server";
import {
  feePayerConfigured,
  getMintDecimals,
  payoutPrizeFromEscrow,
  raffleEscrowPubkey,
  refundPrizeToCreator,
  uiToRaw,
  verifyDepositTx,
  buildPrizeDepositInstructions,
} from "@/lib/raffle-escrow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_DEFAULT = "tokenshit-1m";
const recent = new Map<string, number[]>();

function rateLimit(key: string, limit = 30): boolean {
  const now = Date.now();
  const arr = (recent.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= limit) return true;
  arr.push(now);
  recent.set(key, arr);
  return false;
}

function validWallet(w: string): boolean {
  try {
    new PublicKey(w);
    return w.length >= 32 && w.length <= 44;
  } catch {
    return false;
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "raffle"
  );
}

async function solanaEntropy(): Promise<{ slot: number; blockhash: string }> {
  const rpc = mainnetRpcUrl();
  const body = (method: string, params: unknown[] = []) =>
    fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(12_000),
    }).then((r) => r.json() as Promise<{ result?: unknown; error?: { message: string } }>);

  const [slotRes, bhRes] = await Promise.all([
    body("getSlot", [{ commitment: "finalized" }]),
    body("getLatestBlockhash", [{ commitment: "finalized" }]),
  ]);
  if (slotRes.error) throw new Error(slotRes.error.message);
  if (bhRes.error) throw new Error(bhRes.error.message);
  const slot = Number(slotRes.result);
  const blockhash = (bhRes.result as { value?: { blockhash?: string } })?.value?.blockhash;
  if (!Number.isFinite(slot) || !blockhash) throw new Error("entropy failed");
  return { slot, blockhash };
}

function serializeRaffle(r: FairRaffleRow, extra?: Record<string, unknown>) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    creatorWallet: r.creator_wallet,
    prize: {
      mint: r.prize_mint,
      symbol: r.prize_symbol,
      amountUi: r.prize_amount_ui,
      amountRaw: r.prize_amount_raw,
      decimals: r.prize_decimals,
      programId: r.prize_program_id,
      label: `${Number(r.prize_amount_ui).toLocaleString()} ${r.prize_symbol}`,
    },
    minEntries: r.min_entries,
    maxEntries: r.max_entries,
    closesAt: r.closes_at,
    winnerWallet: r.winner_wallet,
    drawId: r.draw_id,
    depositSig: r.deposit_sig,
    payoutSig: r.payout_sig,
    refundSig: r.refund_sig,
    drawnAt: r.drawn_at,
    createdAt: r.created_at,
    addressUrl: `https://sol.new/address/${r.prize_mint}`,
    ...extra,
  };
}

async function runDrawAndPayout(raffle: FairRaffleRow): Promise<{
  drawId: string;
  winner: string;
  winnerIndex: number;
  payoutSig: string | null;
  entryCount: number;
}> {
  const wallets = await getAllRaffleWallets(raffle.id);
  if (wallets.length < raffle.min_entries) {
    throw new Error(
      `Need at least ${raffle.min_entries} entries (have ${wallets.length})`,
    );
  }

  const id = makeDrawId();
  const entriesHash = await hashEntries(wallets);
  const { slot, blockhash } = await solanaEntropy();
  const seed = await sha256Hex(
    `${entriesHash}|${slot}|${blockhash}|${raffle.id}|fair-raffle-v2`,
  );
  const winnerIndex = indexFromSeed(seed, wallets.length);
  const winner = wallets[winnerIndex]!;
  const verificationHash = await sha256Hex(
    `${seed}|${winnerIndex}|${winner}|${entriesHash}`,
  );

  await saveVrfDraw({
    id,
    mode: "list",
    entries: wallets,
    entriesHash,
    entryCount: wallets.length,
    winnerIndex,
    winner,
    seed,
    verificationHash,
    provider: "solana",
    slot,
    blockhash,
    title: raffle.title,
    wallet: raffle.creator_wallet,
  });

  let payoutSig: string | null = null;
  // Auto-payout when escrow funded (user raffles with deposit)
  if (
    raffle.deposit_sig &&
    raffle.prize_amount_raw &&
    feePayerConfigured() &&
    raffle.creator_wallet !== "sol.new"
  ) {
    try {
      const pay = await payoutPrizeFromEscrow({
        winner,
        mint: raffle.prize_mint,
        amountRaw: BigInt(raffle.prize_amount_raw),
        decimals: raffle.prize_decimals,
        programId: raffle.prize_program_id || undefined,
      });
      payoutSig = pay.signature;
    } catch (e) {
      console.error("[raffle payout]", e);
      // still mark drawn — payout can be retried
    }
  }

  await markRaffleDrawn({
    raffleId: raffle.id,
    winnerWallet: winner,
    drawId: id,
    payoutSig,
  });

  return {
    drawId: id,
    winner,
    winnerIndex,
    payoutSig,
    entryCount: wallets.length,
  };
}

/** GET ?id= | ?slug= | list=1 | wallet= */
export async function GET(req: NextRequest) {
  await initDb();
  await ensureDefaultTokenshitRaffle();

  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  const slug = req.nextUrl.searchParams.get("slug")?.trim() || "";
  const list = req.nextUrl.searchParams.get("list") === "1";
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";

  if (list || (!id && !slug)) {
    const rows = await listOpenFairRaffles(40);
    // always include official
    const official = await ensureDefaultTokenshitRaffle();
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (!byId.has(official.id)) rows.unshift(official);

    const out = [];
    for (const r of rows.slice(0, 40)) {
      const entryCount = await countRaffleEntries(r.id);
      const entered = wallet ? await isWalletEntered(r.id, wallet) : false;
      out.push(
        serializeRaffle(r, {
          entryCount,
          entered,
          canDraw:
            r.status === "open" &&
            entryCount >= r.min_entries &&
            (!r.closes_at || new Date(r.closes_at + "Z").getTime() <= Date.now() + 60_000),
          escrow: feePayerConfigured() ? raffleEscrowPubkey() : null,
        }),
      );
    }
    return NextResponse.json({ ok: true, raffles: out });
  }

  let raffle = id
    ? await getFairRaffleById(id)
    : await getFairRaffleBySlug(slug || SLUG_DEFAULT);
  if (!raffle && (slug === SLUG_DEFAULT || !slug)) {
    raffle = await ensureDefaultTokenshitRaffle();
  }
  if (!raffle) {
    return NextResponse.json({ error: "Raffle not found" }, { status: 404 });
  }

  const [entryCount, entries, entered] = await Promise.all([
    countRaffleEntries(raffle.id),
    listRaffleEntries(raffle.id, 80),
    wallet ? isWalletEntered(raffle.id, wallet) : Promise.resolve(false),
  ]);

  return NextResponse.json({
    ok: true,
    raffle: serializeRaffle(raffle, {
      entryCount,
      entered,
      canDraw: raffle.status === "open" && entryCount >= raffle.min_entries,
      escrow: feePayerConfigured() ? raffleEscrowPubkey() : null,
    }),
    entryCount,
    entered,
    entries: entries.map((e: { wallet: string; created_at: string }) => ({
      wallet: e.wallet,
      createdAt: e.created_at,
    })),
    canDraw: raffle.status === "open" && entryCount >= raffle.min_entries,
  });
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await initDb();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  // ── create ──────────────────────────────────────────────────────────
  if (action === "create") {
    if (!feePayerConfigured()) {
      return NextResponse.json(
        { error: "Escrow not configured on server" },
        { status: 503 },
      );
    }
    const creatorWallet = String(body.wallet || "").trim();
    const title = String(body.title || "Fair raffle").trim().slice(0, 80);
    const prizeMint = String(body.prizeMint || body.mint || "").trim();
    const prizeAmountUi = String(body.prizeAmount || body.amount || "").trim();
    const durationMinutes = Math.floor(Number(body.durationMinutes) || 0);
    const prizeSymbolIn = String(body.prizeSymbol || "").trim().slice(0, 16);

    if (!validWallet(creatorWallet)) {
      return NextResponse.json({ error: "Invalid creator wallet" }, { status: 400 });
    }
    if (!validWallet(prizeMint)) {
      return NextResponse.json({ error: "Invalid prize mint (CA)" }, { status: 400 });
    }
    if (durationMinutes < 5 || durationMinutes > 60 * 24 * 30) {
      return NextResponse.json(
        { error: "Duration must be 5 minutes – 30 days" },
        { status: 400 },
      );
    }

    let decimals: number;
    let programId: string;
    try {
      const m = await getMintDecimals(prizeMint);
      decimals = m.decimals;
      programId = m.programId;
    } catch {
      return NextResponse.json(
        { error: "Could not read mint on-chain — check CA" },
        { status: 400 },
      );
    }

    let amountRaw: bigint;
    try {
      amountRaw = uiToRaw(prizeAmountUi, decimals);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid amount" },
        { status: 400 },
      );
    }

    const closesAt = new Date(Date.now() + durationMinutes * 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "")
      .replace("T", " ");

    const id = `raffle_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = `${slugify(title)}-${id.slice(-6)}`;
    const symbol = prizeSymbolIn || prizeMint.slice(0, 4).toUpperCase();

    await createFairRaffle({
      id,
      slug,
      title,
      prizeMint,
      prizeSymbol: symbol,
      prizeAmountUi,
      prizeDecimals: decimals,
      prizeAmountRaw: String(amountRaw),
      prizeProgramId: programId,
      creatorWallet,
      closesAt,
      minEntries: Math.max(2, Math.floor(Number(body.minEntries) || 2)),
      maxEntries: Math.min(5000, Math.max(2, Math.floor(Number(body.maxEntries) || 5000))),
    });

    const escrow = raffleEscrowPubkey();
    const ix = buildPrizeDepositInstructions({
      creator: new PublicKey(creatorWallet),
      escrow: new PublicKey(escrow),
      mint: new PublicKey(prizeMint),
      amountRaw,
      decimals,
      programId: new PublicKey(programId),
    });

    // Build unsigned tx for client passkey sign
    const connection = new Connection(mainnetRpcUrl(), "confirmed");
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    for (const i of ix) tx.add(i);
    tx.feePayer = new PublicKey(creatorWallet);
    tx.recentBlockhash = blockhash;
    const txBase64 = Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString("base64");

    return NextResponse.json({
      ok: true,
      raffleId: id,
      slug,
      status: "pending_fund",
      escrow,
      closesAt,
      depositTxBase64: txBase64,
      prize: {
        mint: prizeMint,
        amountUi: prizeAmountUi,
        amountRaw: String(amountRaw),
        decimals,
        symbol,
      },
      message: "Sign deposit to fund prize escrow, then POST fund with signature",
    });
  }

  // ── fund (after deposit) ────────────────────────────────────────────
  if (action === "fund") {
    const raffleId = String(body.raffleId || "").trim();
    const depositSig = String(body.depositSig || body.signature || "").trim();
    const wallet = String(body.wallet || "").trim();
    const raffle = await getFairRaffleById(raffleId);
    if (!raffle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (raffle.creator_wallet !== wallet) {
      return NextResponse.json({ error: "Not creator" }, { status: 403 });
    }
    if (raffle.status !== "pending_fund") {
      return NextResponse.json({ error: "Not awaiting fund", status: raffle.status });
    }
    if (!depositSig || depositSig.length < 64) {
      return NextResponse.json({ error: "depositSig required" }, { status: 400 });
    }
    if (!raffle.prize_amount_raw) {
      return NextResponse.json({ error: "Missing prize amount" }, { status: 500 });
    }

    const escrow = raffleEscrowPubkey();
    const ok = await verifyDepositTx({
      signature: depositSig,
      mint: raffle.prize_mint,
      escrow,
      amountRaw: BigInt(raffle.prize_amount_raw),
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Deposit not verified on-chain yet — wait confirm and retry" },
        { status: 400 },
      );
    }
    await markRaffleFunded({ id: raffleId, depositSig });
    return NextResponse.json({ ok: true, funded: true, status: "open" });
  }

  // ── register ────────────────────────────────────────────────────────
  if (action === "register") {
    const wallet = String(body.wallet || "").trim();
    const raffleId = String(body.raffleId || "").trim();
    const slug = String(body.slug || "").trim();
    if (!validWallet(wallet)) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    let raffle = raffleId
      ? await getFairRaffleById(raffleId)
      : await getFairRaffleBySlug(slug || SLUG_DEFAULT);
    if (!raffle && !raffleId) raffle = await ensureDefaultTokenshitRaffle();
    if (!raffle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (raffle.status !== "open") {
      return NextResponse.json(
        { error: "Raffle not open", status: raffle.status },
        { status: 409 },
      );
    }
    if (raffle.closes_at) {
      const closeMs = Date.parse(raffle.closes_at.replace(" ", "T") + "Z");
      if (Number.isFinite(closeMs) && closeMs <= Date.now()) {
        return NextResponse.json({ error: "Raffle closed" }, { status: 409 });
      }
    }
    const count = await countRaffleEntries(raffle.id);
    if (count >= raffle.max_entries) {
      return NextResponse.json({ error: "Raffle full" }, { status: 409 });
    }
    if (await isWalletEntered(raffle.id, wallet)) {
      return NextResponse.json({
        ok: true,
        already: true,
        entryCount: count,
      });
    }
    try {
      await registerRaffleEntry(raffle.id, wallet);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE|unique/i.test(msg)) {
        return NextResponse.json({ ok: true, already: true });
      }
      throw e;
    }
    return NextResponse.json({
      ok: true,
      registered: true,
      entryCount: await countRaffleEntries(raffle.id),
      wallet,
    });
  }

  // ── delay ───────────────────────────────────────────────────────────
  if (action === "delay") {
    const raffleId = String(body.raffleId || "").trim();
    const wallet = String(body.wallet || "").trim();
    const addMinutes = Math.floor(Number(body.addMinutes) || 0);
    const raffle = await getFairRaffleById(raffleId);
    if (!raffle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (raffle.creator_wallet !== wallet) {
      return NextResponse.json({ error: "Not creator" }, { status: 403 });
    }
    if (raffle.status !== "open") {
      return NextResponse.json({ error: "Only open raffles" }, { status: 409 });
    }
    if (addMinutes < 5 || addMinutes > 60 * 24 * 14) {
      return NextResponse.json(
        { error: "Delay 5 min – 14 days" },
        { status: 400 },
      );
    }
    const base = raffle.closes_at
      ? Date.parse(raffle.closes_at.replace(" ", "T") + "Z")
      : Date.now();
    const next = new Date(Math.max(base, Date.now()) + addMinutes * 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "")
      .replace("T", " ");
    await delayFairRaffle({ id: raffleId, creatorWallet: wallet, closesAt: next });
    return NextResponse.json({ ok: true, closesAt: next });
  }

  // ── cancel ──────────────────────────────────────────────────────────
  if (action === "cancel") {
    const raffleId = String(body.raffleId || "").trim();
    const wallet = String(body.wallet || "").trim();
    const raffle = await getFairRaffleById(raffleId);
    if (!raffle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (raffle.creator_wallet !== wallet) {
      return NextResponse.json({ error: "Not creator" }, { status: 403 });
    }
    if (!["open", "pending_fund"].includes(raffle.status)) {
      return NextResponse.json({ error: "Cannot cancel" }, { status: 409 });
    }

    let refundSig: string | null = null;
    if (
      raffle.status === "open" &&
      raffle.deposit_sig &&
      raffle.prize_amount_raw &&
      feePayerConfigured()
    ) {
      try {
        const ref = await refundPrizeToCreator({
          creator: wallet,
          mint: raffle.prize_mint,
          amountRaw: BigInt(raffle.prize_amount_raw),
          decimals: raffle.prize_decimals,
          programId: raffle.prize_program_id || undefined,
        });
        refundSig = ref.signature;
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? `Refund failed: ${e.message}`
                : "Refund failed",
          },
          { status: 502 },
        );
      }
    }

    await cancelFairRaffle({
      id: raffleId,
      creatorWallet: wallet,
      refundSig,
    });
    return NextResponse.json({ ok: true, cancelled: true, refundSig });
  }

  // ── draw (manual) ───────────────────────────────────────────────────
  if (action === "draw") {
    const raffleId = String(body.raffleId || "").trim();
    const slug = String(body.slug || "").trim();
    let raffle = raffleId
      ? await getFairRaffleById(raffleId)
      : await getFairRaffleBySlug(slug || SLUG_DEFAULT);
    if (!raffle && !raffleId) raffle = await ensureDefaultTokenshitRaffle();
    if (!raffle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (raffle.status !== "open") {
      return NextResponse.json(
        {
          error: "Already closed",
          winnerWallet: raffle.winner_wallet,
          drawId: raffle.draw_id,
        },
        { status: 409 },
      );
    }
    try {
      const result = await runDrawAndPayout(raffle);
      return NextResponse.json({
        ok: true,
        drawn: true,
        ...result,
        receiptUrl: `https://sol.new/draw/${result.drawId}`,
        prize: {
          mint: raffle.prize_mint,
          symbol: raffle.prize_symbol,
          amountUi: raffle.prize_amount_ui,
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Draw failed" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json(
    {
      error:
        "Unknown action. Use create | fund | register | delay | cancel | draw",
    },
    { status: 400 },
  );
}
