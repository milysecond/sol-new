import { NextRequest, NextResponse } from "next/server";
import {
  initDb,
  listDueFairRaffles,
  getAllRaffleWallets,
  markRaffleDrawn,
  saveVrfDraw,
  type FairRaffleRow,
} from "@/lib/db";
import { hashEntries, indexFromSeed, makeDrawId, sha256Hex } from "@/lib/vrf";
import { mainnetRpcUrl } from "@/lib/rpc-server";
import {
  feePayerConfigured,
  payoutPrizeFromEscrow,
} from "@/lib/raffle-escrow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron tick: auto-draw + payout due raffles.
 * Auth: Authorization: Bearer $RAFFLE_CRON_SECRET or ?secret=
 */
function authorized(req: NextRequest): boolean {
  const secret =
    process.env.RAFFLE_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!secret) {
    // allow in dev if no secret set — still require header in production
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || q === secret;
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

async function drawOne(raffle: FairRaffleRow) {
  const wallets = await getAllRaffleWallets(raffle.id);
  if (wallets.length < raffle.min_entries) {
    // not enough entries — cancel & refund if escrowed
    return {
      id: raffle.id,
      skipped: true,
      reason: `only ${wallets.length} entries (min ${raffle.min_entries})`,
    };
  }

  const id = makeDrawId();
  const entriesHash = await hashEntries(wallets);
  const { slot, blockhash } = await solanaEntropy();
  const seed = await sha256Hex(
    `${entriesHash}|${slot}|${blockhash}|${raffle.id}|fair-raffle-v2-auto`,
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
  if (
    raffle.deposit_sig &&
    raffle.prize_amount_raw &&
    feePayerConfigured() &&
    raffle.creator_wallet &&
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
      console.error("[raffle auto payout]", raffle.id, e);
    }
  }

  await markRaffleDrawn({
    raffleId: raffle.id,
    winnerWallet: winner,
    drawId: id,
    payoutSig,
  });

  return {
    id: raffle.id,
    drawId: id,
    winner,
    payoutSig,
    entryCount: wallets.length,
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initDb();
  const due = await listDueFairRaffles();
  const results = [];
  for (const r of due) {
    try {
      results.push(await drawOne(r));
    } catch (e) {
      results.push({
        id: r.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
