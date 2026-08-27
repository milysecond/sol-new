import { NextResponse } from "next/server";
import { mainnetRpcCall } from "@/lib/rpc-server";

export const dynamic = "force-dynamic";

/** SPL token account data length (classic ATA). */
const TOKEN_ACCOUNT_SPACE = 165;
/** Empty system account (0 data). */
const SYSTEM_ACCOUNT_SPACE = 0;

const WSOL = "So11111111111111111111111111111111111111112";

async function rentExemption(space: number): Promise<number> {
  const result = await mainnetRpcCall<number>(
    "getMinimumBalanceForRentExemption",
    [space],
  );
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("RPC rent exemption failed");
  }
  return result;
}

async function solUsd(): Promise<number> {
  // Prefer free public spots (no JUP key required for this tiny tool)
  const sources: Array<() => Promise<number>> = [
    async () => {
      const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6_000),
      });
      if (!r.ok) throw new Error("coinbase");
      const j = (await r.json()) as { data?: { amount?: string } };
      const n = Number(j.data?.amount);
      if (!n) throw new Error("coinbase empty");
      return n;
    },
    async () => {
      const r = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6_000) },
      );
      if (!r.ok) throw new Error("binance");
      const j = (await r.json()) as { price?: string };
      const n = Number(j.price);
      if (!n) throw new Error("binance empty");
      return n;
    },
    async () => {
      // Jupiter lite if available
      const key = process.env.JUP_API_KEY?.trim();
      const url = key
        ? `https://api.jup.ag/price/v3?ids=${WSOL}`
        : `https://lite-api.jup.ag/price/v3?ids=${WSOL}`;
      const r = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...(key ? { "x-api-key": key } : {}),
        },
        signal: AbortSignal.timeout(6_000),
      });
      if (!r.ok) throw new Error("jup");
      const j = (await r.json()) as Record<
        string,
        { usdPrice?: number; price?: number }
      >;
      const row = j[WSOL];
      const n = Number(row?.usdPrice ?? row?.price);
      if (!n) throw new Error("jup empty");
      return n;
    },
  ];

  for (const src of sources) {
    try {
      return await src();
    } catch {
      /* next */
    }
  }
  return 0;
}

/**
 * GET /api/rent
 * Live Solana rent-exempt minimums (token ATA 165 + system 0) + SOL USD.
 * Fast · cached ~60s at edge.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawSpace = url.searchParams.get("space");
    const customNum = rawSpace != null && rawSpace !== "" ? Number(rawSpace) : NaN;
    const extraSpace =
      Number.isFinite(customNum) && customNum >= 0 && customNum <= 10_000_000
        ? Math.floor(customNum)
        : null;

    const [tokenLamports, systemLamports, price, customLamports] =
      await Promise.all([
        rentExemption(TOKEN_ACCOUNT_SPACE),
        rentExemption(SYSTEM_ACCOUNT_SPACE),
        solUsd(),
        extraSpace != null ? rentExemption(extraSpace) : Promise.resolve(null),
      ]);

    const pack = (lamports: number) => {
      const sol = lamports / 1e9;
      return {
        lamports,
        sol,
        usd: price > 0 ? sol * price : null,
      };
    };

    return NextResponse.json(
      {
        ok: true,
        price,
        /** Primary: SPL token account (165 bytes) — same as minrent.sal.fun */
        rentLamports: tokenLamports,
        rentInSol: tokenLamports / 1e9,
        rentInUsd: price > 0 ? (tokenLamports / 1e9) * price : null,
        tokenAccount: {
          space: TOKEN_ACCOUNT_SPACE,
          ...pack(tokenLamports),
        },
        systemAccount: {
          space: SYSTEM_ACCOUNT_SPACE,
          ...pack(systemLamports),
        },
        ...(customLamports != null && extraSpace != null
          ? {
              custom: {
                space: extraSpace,
                ...pack(customLamports),
              },
            }
          : {}),
        note: "Rent-exempt minimum is refunded when you close the account.",
        source: "getMinimumBalanceForRentExemption",
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Rent fetch failed",
      },
      { status: 502 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
