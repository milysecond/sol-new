import { NextRequest, NextResponse } from "next/server";

/**
 * Watchlist quotes — Jupiter (price + metadata) + RugCheck (risk).
 * RugCheck is rate-limited hard (429): sequential + cache + soft-fail.
 *
 * GET /api/lists/quotes?mints=mint1,mint2,...
 */

const MAX_MINTS = 30;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const JUP_PRICE = "https://lite-api.jup.ag/price/v3";
const JUP_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";
const RUGCHECK = "https://api.rugcheck.xyz/v1/tokens";

/** Per-isolate cache — cuts repeat 429s when refreshing the same list. */
const RUG_CACHE_TTL_MS = 10 * 60_000;
const rugCache = new Map<
  string,
  { at: number; ok: true; data: RugSummary } | { at: number; ok: false; status: number }
>();

export type QuoteRow = {
  mint: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  imageUrl: string | null;
  name: string | null;
  symbol: string | null;
  riskScore: number | null;
  riskLevel: "good" | "warn" | "danger" | "unknown";
  rugged: boolean;
  risks: { name: string; level: string; description?: string }[];
  lpLockedPct: number | null;
  sources: { jupiter: boolean; rugcheck: boolean };
  error?: string | null;
};

type JupPriceRow = {
  usdPrice?: number;
  priceChange24h?: number;
  liquidity?: number;
};

type JupTokenRow = {
  id?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  mcap?: number | null;
  fdv?: number | null;
  usdPrice?: number | null;
  liquidity?: number | null;
  stats24h?: {
    priceChange?: number;
    buyVolume?: number;
    sellVolume?: number;
  };
  isSus?: boolean;
};

type RugSummary = {
  score?: number;
  score_normalised?: number;
  rugged?: boolean;
  lpLockedPct?: number;
  risks?: { name?: string; level?: string; description?: string }[];
};

function emptyQuote(mint: string, error?: string): QuoteRow {
  return {
    mint,
    priceUsd: null,
    marketCapUsd: null,
    change24h: null,
    volume24h: null,
    liquidityUsd: null,
    imageUrl: null,
    name: null,
    symbol: null,
    riskScore: null,
    riskLevel: "unknown",
    rugged: false,
    risks: [],
    lpLockedPct: null,
    sources: { jupiter: false, rugcheck: false },
    error: error ?? null,
  };
}

function riskLevelFrom(
  score: number | null,
  rugged: boolean,
  risks: { level?: string }[],
): QuoteRow["riskLevel"] {
  if (rugged) return "danger";
  if (
    risks.some((r) => {
      const l = (r.level || "").toLowerCase();
      return l === "danger" || l === "critical";
    })
  ) {
    return "danger";
  }
  if (score == null) return "unknown";
  if (score >= 40) return "danger";
  if (score >= 15) return "warn";
  return "good";
}

async function safeFetchJson<T>(
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      // Allow edge/CDN cache for upstream where possible
      next: { revalidate: 60 },
    } as RequestInit);
    if (!res.ok) {
      return { ok: false, status: res.status, message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = /abort|timeout/i.test(msg);
    return { ok: false, status: aborted ? 504 : 502, message: aborted ? "timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchRugSummary(
  mint: string,
): Promise<{ ok: true; data: RugSummary } | { ok: false; status: number; message: string; cached?: boolean }> {
  const cached = rugCache.get(mint);
  if (cached && Date.now() - cached.at < RUG_CACHE_TTL_MS) {
    if (cached.ok) return { ok: true, data: cached.data };
    // Don't re-hit for recent 429s
    if (cached.status === 429) {
      return { ok: false, status: 429, message: "HTTP 429", cached: true };
    }
  }

  const res = await safeFetchJson<RugSummary>(
    `${RUGCHECK}/${mint}/report/summary`,
    5_000,
  );

  if (res.ok) {
    rugCache.set(mint, { at: Date.now(), ok: true, data: res.data });
    return res;
  }

  rugCache.set(mint, { at: Date.now(), ok: false, status: res.status });
  return res;
}

/**
 * Sequential rugcheck with backoff — parallel blasts trigger 429 immediately.
 * Stops further live requests after first 429; remaining mints stay "unknown".
 */
async function fetchRugBatch(mints: string[]): Promise<{
  results: { mint: string; res: Awaited<ReturnType<typeof fetchRugSummary>> }[];
  rateLimited: boolean;
  okCount: number;
}> {
  const results: { mint: string; res: Awaited<ReturnType<typeof fetchRugSummary>> }[] = [];
  let rateLimited = false;
  let okCount = 0;
  let liveCalls = 0;

  for (const mint of mints) {
    const hadFreshCache =
      rugCache.has(mint) && Date.now() - (rugCache.get(mint)!.at) < RUG_CACHE_TTL_MS;

    if (rateLimited && !hadFreshCache) {
      results.push({
        mint,
        res: { ok: false, status: 429, message: "HTTP 429", cached: true },
      });
      continue;
    }

    // Small gap between live calls
    if (liveCalls > 0 && !hadFreshCache) await sleep(200);

    const res = await fetchRugSummary(mint);
    if (!hadFreshCache) liveCalls++;

    if (res.ok) okCount++;
    if (!res.ok && res.status === 429) rateLimited = true;

    results.push({ mint, res });
  }

  return { results, rateLimited, okCount };
}

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("mints") || "";
    const mints = [
      ...new Set(
        raw
          .split(",")
          .map((m) => m.trim())
          .filter((m) => BASE58_RE.test(m)),
      ),
    ].slice(0, MAX_MINTS);

    if (mints.length === 0) {
      return NextResponse.json(
        { quotes: {}, errors: ["No valid mint addresses"], warnings: [] },
        { status: 400 },
      );
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const quotes: Record<string, QuoteRow> = {};
    for (const mint of mints) quotes[mint] = emptyQuote(mint);

    const searchChunks: string[][] = [];
    for (let i = 0; i < mints.length; i += 10) {
      searchChunks.push(mints.slice(i, i + 10));
    }

    // Jupiter first (batch) — do not block on rugcheck
    const [priceRes, searchResults] = await Promise.all([
      safeFetchJson<Record<string, JupPriceRow | undefined>>(
        `${JUP_PRICE}?ids=${mints.join(",")}`,
        8_000,
      ),
      Promise.all(
        searchChunks.map((chunk) =>
          safeFetchJson<JupTokenRow[]>(
            `${JUP_SEARCH}?query=${encodeURIComponent(chunk.join(","))}`,
            8_000,
          ),
        ),
      ),
    ]);

    if (priceRes.ok) {
      for (const mint of mints) {
        const row = priceRes.data[mint];
        if (!row) continue;
        const q = quotes[mint];
        q.sources.jupiter = true;
        if (typeof row.usdPrice === "number" && Number.isFinite(row.usdPrice)) {
          q.priceUsd = row.usdPrice;
        }
        if (typeof row.priceChange24h === "number" && Number.isFinite(row.priceChange24h)) {
          q.change24h = row.priceChange24h;
        }
        if (typeof row.liquidity === "number" && Number.isFinite(row.liquidity)) {
          q.liquidityUsd = row.liquidity;
        }
        q.error = null;
      }
    } else {
      errors.push(`jupiter_price: ${priceRes.message}`);
    }

    let searchOk = false;
    for (const res of searchResults) {
      if (!res.ok) {
        errors.push(`jupiter_search: ${res.message}`);
        continue;
      }
      searchOk = true;
      const list = Array.isArray(res.data) ? res.data : [];
      for (const tok of list) {
        const mint = tok.id;
        if (!mint || !quotes[mint]) continue;
        const q = quotes[mint];
        q.sources.jupiter = true;
        q.name = tok.name ?? q.name;
        q.symbol = tok.symbol ?? q.symbol;
        q.imageUrl = tok.icon ?? q.imageUrl;
        if (typeof tok.mcap === "number" && Number.isFinite(tok.mcap)) {
          q.marketCapUsd = tok.mcap;
        } else if (
          typeof tok.fdv === "number" &&
          Number.isFinite(tok.fdv) &&
          q.marketCapUsd == null
        ) {
          q.marketCapUsd = tok.fdv;
        }
        if (
          typeof tok.usdPrice === "number" &&
          Number.isFinite(tok.usdPrice) &&
          q.priceUsd == null
        ) {
          q.priceUsd = tok.usdPrice;
        }
        if (
          typeof tok.liquidity === "number" &&
          Number.isFinite(tok.liquidity) &&
          q.liquidityUsd == null
        ) {
          q.liquidityUsd = tok.liquidity;
        }
        const ch = tok.stats24h?.priceChange;
        if (typeof ch === "number" && Number.isFinite(ch) && q.change24h == null) {
          q.change24h = ch;
        }
        const buy = tok.stats24h?.buyVolume ?? 0;
        const sell = tok.stats24h?.sellVolume ?? 0;
        if ((buy || sell) && q.volume24h == null) {
          q.volume24h = buy + sell;
        }
        if (tok.isSus && q.riskLevel !== "danger") {
          q.riskLevel = "warn";
        }
        q.error = null;
      }
    }
    if (!searchOk && !priceRes.ok) {
      errors.push("jupiter: all endpoints failed");
    }

    // RugCheck — sequential + cache (soft-fail)
    const rugBatch = await fetchRugBatch(mints);
    for (const { mint, res } of rugBatch.results) {
      if (!res.ok) continue;
      const q = quotes[mint];
      const data = res.data;
      q.sources.rugcheck = true;
      const score =
        typeof data.score_normalised === "number"
          ? data.score_normalised
          : typeof data.score === "number"
            ? data.score
            : null;
      q.riskScore = score;
      q.rugged = !!data.rugged;
      q.lpLockedPct =
        typeof data.lpLockedPct === "number" && Number.isFinite(data.lpLockedPct)
          ? data.lpLockedPct
          : null;
      q.risks = (data.risks ?? [])
        .filter((r) => r?.name)
        .map((r) => ({
          name: r.name!,
          level: r.level || "warn",
          description: r.description,
        }));
      q.riskLevel = riskLevelFrom(score, q.rugged, q.risks);
      q.error = null;
    }

    if (rugBatch.rateLimited) {
      warnings.push("Risk scores delayed — RugCheck rate limit. Prices still live.");
    } else if (rugBatch.okCount === 0 && mints.length > 0) {
      // only warn if nothing cached either and we expected risk data
      const anyRugAttemptFailed = rugBatch.results.some((r) => !r.res.ok && r.res.status !== 404);
      if (anyRugAttemptFailed) {
        warnings.push("Risk scores unavailable right now.");
      }
    }

    for (const mint of mints) {
      const q = quotes[mint];
      if (!q.sources.jupiter && !q.sources.rugcheck) {
        q.error = q.error || "No market data for this token";
      }
    }

    const anyData = mints.some(
      (m) => quotes[m].sources.jupiter || quotes[m].sources.rugcheck,
    );

    return NextResponse.json(
      {
        quotes,
        errors: errors.slice(0, 12),
        warnings: warnings.slice(0, 6),
        meta: {
          count: mints.length,
          jupiterPrice: priceRes.ok,
          jupiterSearch: searchOk,
          rugcheckOk: rugBatch.okCount,
          rugcheckRateLimited: rugBatch.rateLimited,
        },
      },
      {
        status: anyData ? 200 : 502,
        headers: {
          // Client + edge can reuse quotes briefly
          "Cache-Control": "public, s-maxage=45, stale-while-revalidate=180",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        quotes: {},
        errors: [e instanceof Error ? e.message : String(e)],
        warnings: [],
      },
      { status: 500 },
    );
  }
}
