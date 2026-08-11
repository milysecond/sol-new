import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
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
} from "@/lib/db";
import {
  hashEntries,
  indexFromSeed,
  makeDrawId,
  sha256Hex,
} from "@/lib/vrf";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG = "tokenshit-1m";
const recent = new Map<string, number[]>();

function rateLimit(key: string, limit = 20): boolean {
  const now = Date.now();
  const arr = (recent.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= limit) return true;
  arr.push(now);
  recent.set(key, arr);
  return false;
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
  const blockhash = (bhRes.result as { value?: { blockhash?: string } })?.value
    ?.blockhash;
  if (!Number.isFinite(slot) || !blockhash) throw new Error("entropy failed");
  return { slot, blockhash };
}

/** GET — raffle status + entries */
export async function GET(req: NextRequest) {
  await initDb();
  const raffle = await ensureDefaultTokenshitRaffle();
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";

  const [entryCount, entries, entered] = await Promise.all([
    countRaffleEntries(raffle.id),
    listRaffleEntries(raffle.id, 50),
    wallet ? isWalletEntered(raffle.id, wallet) : Promise.resolve(false),
  ]);

  return NextResponse.json({
    ok: true,
    raffle: {
      id: raffle.id,
      slug: raffle.slug,
      title: raffle.title,
      status: raffle.status,
      prize: {
        mint: raffle.prize_mint,
        symbol: raffle.prize_symbol,
        amountUi: raffle.prize_amount_ui,
        decimals: raffle.prize_decimals,
        label: `${Number(raffle.prize_amount_ui).toLocaleString()} ${raffle.prize_symbol}`,
      },
      minEntries: raffle.min_entries,
      maxEntries: raffle.max_entries,
      winnerWallet: raffle.winner_wallet,
      drawId: raffle.draw_id,
      drawnAt: raffle.drawn_at,
      createdAt: raffle.created_at,
      addressUrl: `https://sol.new/address/${raffle.prize_mint}`,
    },
    entryCount,
    entered,
    entries: entries.map((e: { wallet: string; created_at: string }) => ({
      wallet: e.wallet,
      createdAt: e.created_at,
    })),
    canDraw: raffle.status === "open" && entryCount >= raffle.min_entries,
  });
}

/**
 * POST actions:
 * - { action: "register", wallet }
 * - { action: "draw" } — run VRF over registered wallets (needs ≥ min entries)
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await initDb();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    wallet?: string;
    slug?: string;
  };

  const slug = body.slug?.trim() || SLUG;
  let raffle = await getFairRaffleBySlug(slug);
  if (!raffle) raffle = await ensureDefaultTokenshitRaffle();

  if (body.action === "register") {
    const wallet = body.wallet?.trim() || "";
    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    if (raffle.status !== "open") {
      return NextResponse.json(
        { error: "Raffle is closed", status: raffle.status },
        { status: 409 },
      );
    }
    const count = await countRaffleEntries(raffle.id);
    if (count >= raffle.max_entries) {
      return NextResponse.json({ error: "Raffle is full" }, { status: 409 });
    }
    if (await isWalletEntered(raffle.id, wallet)) {
      return NextResponse.json({
        ok: true,
        already: true,
        entryCount: count,
        message: "Already registered",
      });
    }
    try {
      await registerRaffleEntry(raffle.id, wallet);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE|unique/i.test(msg)) {
        return NextResponse.json({
          ok: true,
          already: true,
          message: "Already registered",
        });
      }
      throw e;
    }
    const entryCount = await countRaffleEntries(raffle.id);
    return NextResponse.json({
      ok: true,
      registered: true,
      entryCount,
      wallet,
    });
  }

  if (body.action === "draw") {
    if (raffle.status !== "open") {
      return NextResponse.json(
        {
          error: "Already drawn",
          winnerWallet: raffle.winner_wallet,
          drawId: raffle.draw_id,
        },
        { status: 409 },
      );
    }
    const wallets = await getAllRaffleWallets(raffle.id);
    if (wallets.length < raffle.min_entries) {
      return NextResponse.json(
        {
          error: `Need at least ${raffle.min_entries} entries (have ${wallets.length})`,
        },
        { status: 400 },
      );
    }

    const id = makeDrawId();
    const entriesHash = await hashEntries(wallets);
    const { slot, blockhash } = await solanaEntropy();
    const seed = await sha256Hex(
      `${entriesHash}|${slot}|${blockhash}|${raffle.id}|fair-raffle-v1`,
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
      wallet: null,
    });
    await markRaffleDrawn({
      raffleId: raffle.id,
      winnerWallet: winner,
      drawId: id,
    });

    return NextResponse.json({
      ok: true,
      drawn: true,
      drawId: id,
      winner,
      winnerIndex,
      entryCount: wallets.length,
      seed,
      verificationHash,
      slot,
      blockhash,
      receiptUrl: `https://sol.new/draw/${id}`,
      prize: {
        mint: raffle.prize_mint,
        symbol: raffle.prize_symbol,
        amountUi: raffle.prize_amount_ui,
      },
    });
  }

  return NextResponse.json(
    { error: "Unknown action. Use register or draw." },
    { status: 400 },
  );
}
