import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  initDb,
  createShortLink,
  getShortLink,
  shortLinkCodeExists,
  getWalletShortLinks,
  paymentSigUsed,
} from "@/lib/db";
import {
  isValidCustomCode,
  normalizeCode,
  normalizeTargetUrl,
  randomShortCode,
  absoluteShortUrl,
  shortPath,
  LINK_FEE_VAULT,
  CUSTOM_LINK_FEE_LAMPORTS,
  CUSTOM_LINK_FEE_SOL,
} from "@/lib/short-link";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 8;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

function originFrom(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "sol.new";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function rpcUrl(): string {
  return mainnetRpcUrl();
}

/**
 * Verify an on-chain payment of exactly CUSTOM_LINK_FEE_LAMPORTS to the fee vault.
 */
async function verifyCustomPayment(
  signature: string,
  expectedPayer: string | null
): Promise<{ ok: true; payer: string } | { ok: false; error: string }> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature)) {
    return { ok: false, error: "Invalid payment signature" };
  }
  if (await paymentSigUsed(signature)) {
    return { ok: false, error: "This payment was already used" };
  }

  const connection = new Connection(rpcUrl(), "confirmed");
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || !tx.meta || tx.meta.err) {
    return { ok: false, error: "Payment transaction not found or failed" };
  }

  const vault = LINK_FEE_VAULT;
  const msg = tx.transaction.message;
  let keys: string[] = [];
  try {
    // web3.js v1: MessageV0 has getAccountKeys; legacy has accountKeys
    const anyMsg = msg as {
      getAccountKeys?: (opts?: { accountKeysFromLookups?: unknown }) => {
        staticAccountKeys: PublicKey[];
        get?: (i: number) => PublicKey | undefined;
        length: number;
      };
      accountKeys?: PublicKey[];
    };
    if (typeof anyMsg.getAccountKeys === "function") {
      const ak = anyMsg.getAccountKeys({
        accountKeysFromLookups: tx.meta.loadedAddresses,
      });
      for (let i = 0; i < ak.length; i++) {
        const k = ak.get?.(i) ?? ak.staticAccountKeys[i];
        if (k) keys.push(k.toBase58());
      }
    } else if (anyMsg.accountKeys) {
      keys = anyMsg.accountKeys.map((k) => k.toBase58());
    }
  } catch {
    keys = [];
  }

  if (!keys.length) {
    return { ok: false, error: "Could not parse payment transaction" };
  }

  const vaultIdx = keys.findIndex((k) => k === vault);
  if (vaultIdx < 0) {
    return { ok: false, error: "Payment must go to the sol.new fee vault" };
  }

  const pre = tx.meta.preBalances[vaultIdx] ?? 0;
  const post = tx.meta.postBalances[vaultIdx] ?? 0;
  const received = post - pre;
  if (received < CUSTOM_LINK_FEE_LAMPORTS) {
    return {
      ok: false,
      error: `Custom codes cost ${CUSTOM_LINK_FEE_SOL} SOL (got ${received / LAMPORTS_PER_SOL} SOL)`,
    };
  }

  const payer = keys[0];
  if (!payer) return { ok: false, error: "Could not determine payer" };
  if (expectedPayer && payer !== expectedPayer) {
    return { ok: false, error: "Payment wallet does not match" };
  }

  return { ok: true, payer };
}

/** Create a short link. Body: { url, code?, title?, wallet?, paymentSig? } */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  try {
    await initDb();
    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      code?: string;
      title?: string;
      wallet?: string;
      paymentSig?: string;
    };

    const target = normalizeTargetUrl(body.url || "");
    if (!target.ok) {
      return NextResponse.json({ ok: false, error: target.error }, { status: 400 });
    }

    const title = body.title?.trim().slice(0, 120) || null;
    const wallet = body.wallet?.trim().slice(0, 64) || null;

    let code: string;
    let paymentSig: string | null = null;

    if (body.code?.trim()) {
      code = normalizeCode(body.code);
      if (!isValidCustomCode(code)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Custom code: 2–32 chars, letters/numbers/_/-, not reserved",
          },
          { status: 400 }
        );
      }
      if (await shortLinkCodeExists(code)) {
        return NextResponse.json({ ok: false, error: "That short code is taken" }, { status: 409 });
      }
      if (!body.paymentSig?.trim()) {
        return NextResponse.json(
          {
            ok: false,
            error: `Custom codes cost ${CUSTOM_LINK_FEE_SOL} SOL. Pay first, then retry with paymentSig.`,
            feeSol: CUSTOM_LINK_FEE_SOL,
            feeLamports: CUSTOM_LINK_FEE_LAMPORTS,
            feeVault: LINK_FEE_VAULT,
          },
          { status: 402 }
        );
      }
      const paid = await verifyCustomPayment(body.paymentSig.trim(), wallet);
      if (!paid.ok) {
        return NextResponse.json({ ok: false, error: paid.error }, { status: 402 });
      }
      paymentSig = body.paymentSig.trim();
    } else {
      code = randomShortCode(7);
      for (let i = 0; i < 6 && (await shortLinkCodeExists(code)); i++) {
        code = randomShortCode(7 + (i > 2 ? 1 : 0));
      }
      if (await shortLinkCodeExists(code)) {
        return NextResponse.json({ ok: false, error: "Could not allocate a code. Try again." }, { status: 500 });
      }
    }

    const saved = await createShortLink({
      code,
      targetUrl: target.url,
      title,
      wallet,
      paymentSig,
    });
    if (!saved) {
      return NextResponse.json({ ok: false, error: "Could not save link" }, { status: 500 });
    }

    const origin = originFrom(req);
    const shortUrl = absoluteShortUrl(code, origin);
    return NextResponse.json({
      ok: true,
      code,
      shortUrl,
      path: shortPath(code),
      targetUrl: target.url,
      title,
      paid: Boolean(paymentSig),
    });
  } catch (e) {
    console.error("link POST", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

/** Lookup a code (?code=) or list links for a wallet (?wallet=). */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const code = req.nextUrl.searchParams.get("code")?.trim();
    const wallet = req.nextUrl.searchParams.get("wallet")?.trim();

    if (code) {
      const link = await getShortLink(normalizeCode(code));
      if (!link) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
        return NextResponse.json({ ok: false, error: "Link expired" }, { status: 410 });
      }
      const origin = originFrom(req);
      return NextResponse.json({
        ok: true,
        ...link,
        shortUrl: absoluteShortUrl(link.code, origin),
      });
    }

    if (wallet) {
      const links = await getWalletShortLinks(wallet, 50);
      const origin = originFrom(req);
      return NextResponse.json({
        ok: true,
        links: links.map((l) => ({
          ...l,
          shortUrl: absoluteShortUrl(l.code, origin),
        })),
      });
    }

    return NextResponse.json({ ok: false, error: "Pass ?code= or ?wallet=" }, { status: 400 });
  } catch (e) {
    console.error("link GET", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
