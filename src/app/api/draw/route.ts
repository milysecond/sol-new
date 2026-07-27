import { NextRequest, NextResponse } from "next/server";
import { initDb, saveVrfDraw } from "@/lib/db";
import {
  type VrfDrawMode,
  type VrfProvider,
  hashEntries,
  indexFromSeed,
  makeDrawId,
  normalizeEntries,
  presetsForMode,
  sha256Hex,
} from "@/lib/vrf";
import { tryProofNetworkRangeDraw } from "@/lib/proofnetwork";
import {
  indexFromMagicblockRandomness,
  magicblockConfigured,
  requestMagicblockRandomness,
} from "@/lib/magicblock-vrf";
import { mainnetRpcUrl } from "@/lib/rpc-server";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;
const MAX_ENTRIES = 500;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

function mainnetRpc(): string {
  return mainnetRpcUrl();
}

async function fetchSolanaEntropy(): Promise<{ slot: number; blockhash: string }> {
  const rpc = mainnetRpc();
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
  if (!Number.isFinite(slot) || !blockhash) throw new Error("Failed to read Solana entropy");
  return { slot, blockhash };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const body = (await req.json()) as {
      mode?: VrfDrawMode;
      entries?: string[];
      rangeEnd?: number;
      title?: string;
      wallet?: string;
    };

    const wallet =
      typeof body.wallet === "string" &&
      body.wallet.length >= 32 &&
      body.wallet.length <= 64
        ? body.wallet
        : null;

    const mode: VrfDrawMode =
      body.mode === "coin" || body.mode === "dice" || body.mode === "range" || body.mode === "list"
        ? body.mode
        : "list";

    let entries: string[];
    if (mode === "coin" || mode === "dice") {
      entries = presetsForMode(mode)!;
    } else if (mode === "range") {
      const end = Math.floor(Number(body.rangeEnd) || 0);
      if (end < 2 || end > MAX_ENTRIES) {
        return NextResponse.json(
          { error: `Range must be 2–${MAX_ENTRIES}` },
          { status: 400 },
        );
      }
      entries = Array.from({ length: end }, (_, i) => String(i + 1));
    } else {
      entries = normalizeEntries(Array.isArray(body.entries) ? body.entries : []);
      if (entries.length < 2) {
        return NextResponse.json({ error: "Need at least 2 entries" }, { status: 400 });
      }
      if (entries.length > MAX_ENTRIES) {
        return NextResponse.json(
          { error: `Max ${MAX_ENTRIES} entries` },
          { status: 400 },
        );
      }
    }

    const id = makeDrawId();
    const entriesHash = await hashEntries(entries);
    const n = entries.length;
    const title = body.title?.trim().slice(0, 80) || null;

    // Entropy order (default): MagicBlock VRF → ProofNetwork → Solana blockhash
    // DRAW_PROVIDER=magicblock | proofnetwork | solana-blockhash forces a source.
    const prefer = (process.env.DRAW_PROVIDER || "auto").toLowerCase().trim();
    const strictMagic = prefer === "magicblock";

    let provider: VrfProvider = "solana-blockhash";
    let seed = "";
    let verificationHash = "";
    let winnerIndex = 0;
    let slot: number | null = null;
    let blockhash: string | null = null;
    let proofnetworkId: number | null = null;

    let resolved = false;

    // 1) MagicBlock on-chain VRF (requires deployed fair-draw program + fee payer)
    if ((prefer === "auto" || prefer === "magicblock") && magicblockConfigured()) {
      const mb = await requestMagicblockRandomness({
        drawIdHex: id,
        entriesHash,
        entryCount: n,
      });
      if (mb) {
        provider = "magicblock";
        seed = mb.seed;
        verificationHash = mb.verificationHash;
        winnerIndex = indexFromMagicblockRandomness(mb.randomness, n);
        blockhash = mb.signature; // store request tx sig in blockhash field for receipt
        resolved = true;
      } else if (strictMagic) {
        return NextResponse.json(
          {
            error:
              "MagicBlock VRF unavailable. Deploy programs/fair-draw and set MAGICBLOCK_FAIR_DRAW_PROGRAM_ID + SOL_FEE_PAYER_SECRET.",
          },
          { status: 503 },
        );
      }
    } else if (strictMagic) {
      return NextResponse.json(
        {
          error:
            "MagicBlock not configured. Set MAGICBLOCK_FAIR_DRAW_PROGRAM_ID and SOL_FEE_PAYER_SECRET (see programs/fair-draw/README.md).",
        },
        { status: 503 },
      );
    }

    // 2) ProofNetwork (optional HTTP VRF)
    if (!resolved && (prefer === "auto" || prefer === "proofnetwork")) {
      const pn = await tryProofNetworkRangeDraw(0, n - 1);
      if (pn && Number.isFinite(pn.result) && pn.result >= 0 && pn.result < n) {
        provider = "proofnetwork";
        seed = pn.seed || (await sha256Hex(`${id}:${pn.result}:${entriesHash}`));
        verificationHash =
          pn.verificationHash || (await sha256Hex(`pn:${seed}:${entriesHash}`));
        winnerIndex = Math.floor(pn.result);
        proofnetworkId = pn.requestId;
        resolved = true;
      }
    }

    // 3) Solana blockhash (public, re-verifiable default)
    if (!resolved) {
      const entropy = await fetchSolanaEntropy();
      slot = entropy.slot;
      blockhash = entropy.blockhash;
      seed = await sha256Hex(`${blockhash}|${entriesHash}|${id}|${slot}`);
      verificationHash = await sha256Hex(`verify:${seed}|${n}`);
      winnerIndex = indexFromSeed(seed, n);
      provider = "solana-blockhash";
    }

    const winner = entries[winnerIndex];

    const createdAt = new Date().toISOString();

    await saveVrfDraw({
      id,
      mode,
      entries,
      entriesHash,
      entryCount: n,
      winnerIndex,
      winner,
      seed,
      verificationHash,
      provider,
      slot,
      blockhash,
      proofnetworkId,
      title,
      wallet,
    });

    return NextResponse.json({
      id,
      mode,
      entryCount: n,
      winnerIndex,
      winner,
      seed,
      verificationHash,
      entriesHash,
      provider,
      slot,
      blockhash,
      proofnetworkId,
      title,
      entries,
      wallet,
      createdAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draw failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** List draws for a wallet (user history). */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
    if (!wallet || wallet.length < 32 || wallet.length > 64) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    const limit = Math.min(
      100,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 40),
    );
    const { getVrfDrawsByWallet } = await import("@/lib/db");
    const rows = await getVrfDrawsByWallet(wallet, limit);
    const draws = rows.map((row) => ({
      id: String(row.id),
      mode: String(row.mode),
      entryCount: Number(row.entry_count),
      winnerIndex: Number(row.winner_index),
      winner: String(row.winner),
      title: row.title != null ? String(row.title) : null,
      createdAt: String(row.created_at),
      entriesHash: String(row.entries_hash),
    }));
    return NextResponse.json({ draws });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
