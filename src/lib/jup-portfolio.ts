/**
 * Jupiter Ultra holdings + Portfolio positions (server-only).
 * Env: JUP_API_KEY | JUPITER_API_KEY
 * Docs: https://dev.jup.ag/docs/portfolio
 */

const JUP_API = "https://api.jup.ag";
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function jupApiKey(): string | null {
  return (
    process.env.JUP_API_KEY?.trim() ||
    process.env.JUPITER_API_KEY?.trim() ||
    null
  );
}

export function jupConfigured(): boolean {
  return Boolean(jupApiKey());
}

function headers(): HeadersInit {
  const key = jupApiKey();
  if (!key) throw new Error("JUP_API_KEY not configured");
  return {
    "x-api-key": key,
    Accept: "application/json",
    "User-Agent": "sol.new",
  };
}

async function jupGet<T>(path: string, init?: { timeoutMs?: number }): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const res = await fetch(`${JUP_API}${path.startsWith("/") ? path : `/${path}`}`, {
    headers: headers(),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string; message?: string })?.error ||
      (data as { message?: string })?.message ||
      text.slice(0, 200) ||
      res.statusText;
    throw new Error(`Jupiter ${res.status}: ${msg}`);
  }
  return data as T;
}

// ── Holdings (Ultra) ──────────────────────────────────────────────────────────

export type JupHoldingAccount = {
  account?: string;
  amount?: string;
  uiAmount?: number;
  uiAmountString?: string;
  decimals?: number;
  isFrozen?: boolean;
  isAssociatedTokenAccount?: boolean;
  programId?: string;
};

export type JupHoldingsRaw = {
  amount?: string;
  uiAmount?: number;
  uiAmountString?: string;
  tokens?: Record<string, JupHoldingAccount[]>;
};

export type JupTokenBalance = {
  mint: string;
  amount: string;
  uiAmount: number;
  decimals: number;
  isFrozen?: boolean;
  priceUsd: number | null;
  valueUsd: number | null;
  symbol?: string | null;
  name?: string | null;
  logoUri?: string | null;
  programId?: string | null;
};

// ── Portfolio positions ───────────────────────────────────────────────────────

export type JupPortfolioElement = {
  type?: string;
  label?: string;
  name?: string;
  platformId?: string;
  networkId?: string;
  value?: number | null;
  data?: unknown;
};

export type JupPositionsRaw = {
  date?: number;
  owner?: string;
  elements?: JupPortfolioElement[];
  duration?: number;
  tokenInfo?: {
    solana?: Record<
      string,
      {
        address?: string;
        name?: string;
        symbol?: string;
        decimals?: number;
        logoURI?: string;
        price?: number;
      }
    >;
  };
  fetcherReports?: { id?: string; status?: string; error?: string }[];
};

export type JupStakedJup = {
  stakedAmount?: number;
  unstaking?: unknown[];
};

export type JupWalletSnapshot = {
  wallet: string;
  sol: number;
  usdc: number;
  tokens: JupTokenBalance[];
  positions: JupPortfolioElement[];
  stakedJup: JupStakedJup | null;
  totals: {
    tokensUsd: number;
    positionsUsd: number;
    stakedJupUsd: number;
    netWorthUsd: number;
  };
  source: "jupiter";
  fetchedAt: string;
};

function sumUi(accounts: JupHoldingAccount[] | undefined): {
  uiAmount: number;
  amount: string;
  decimals: number;
  isFrozen?: boolean;
  programId?: string;
} {
  if (!accounts?.length) return { uiAmount: 0, amount: "0", decimals: 0 };
  let ui = 0;
  let raw = BigInt(0);
  let decimals = accounts[0]?.decimals ?? 0;
  let isFrozen = false;
  let programId = accounts[0]?.programId;
  for (const a of accounts) {
    if (typeof a.uiAmount === "number") ui += a.uiAmount;
    else if (a.uiAmountString) ui += Number(a.uiAmountString) || 0;
    if (a.amount) {
      try {
        raw += BigInt(a.amount);
      } catch {
        /* ignore */
      }
    }
    if (a.decimals != null) decimals = a.decimals;
    if (a.isFrozen) isFrozen = true;
    if (a.programId) programId = a.programId;
  }
  return {
    uiAmount: ui,
    amount: raw.toString(),
    decimals,
    isFrozen: isFrozen || undefined,
    programId,
  };
}

export async function jupHoldings(wallet: string): Promise<JupHoldingsRaw> {
  return jupGet<JupHoldingsRaw>(`/ultra/v1/holdings/${encodeURIComponent(wallet)}`, {
    timeoutMs: 12_000,
  });
}

export async function jupPositions(wallet: string): Promise<JupPositionsRaw> {
  return jupGet<JupPositionsRaw>(
    `/portfolio/v1/positions/${encodeURIComponent(wallet)}`,
    { timeoutMs: 25_000 }
  );
}

export async function jupStakedJup(wallet: string): Promise<JupStakedJup | null> {
  try {
    return await jupGet<JupStakedJup>(
      `/portfolio/v1/staked-jup/${encodeURIComponent(wallet)}`,
      { timeoutMs: 10_000 }
    );
  } catch {
    return null;
  }
}

/** Price map mint → usd */
export async function jupPrices(mints: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(mints.filter(Boolean))];
  if (!unique.length) return {};
  const out: Record<string, number> = {};
  // batch in chunks of 50
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    try {
      const data = await jupGet<Record<string, { usdPrice?: number; price?: number } | number>>(
        `/price/v3?ids=${chunk.join(",")}`,
        { timeoutMs: 10_000 }
      );
      for (const [mint, v] of Object.entries(data || {})) {
        if (typeof v === "number") out[mint] = v;
        else if (v && typeof v === "object") {
          const p = v.usdPrice ?? v.price;
          if (typeof p === "number") out[mint] = p;
        }
      }
    } catch {
      /* skip chunk */
    }
  }
  return out;
}

/**
 * Full wallet snapshot: Ultra holdings + Jupiter portfolio positions + prices.
 */
export async function jupWalletSnapshot(wallet: string): Promise<JupWalletSnapshot> {
  const [holdingsRes, positionsRes, stakedRes] = await Promise.all([
    jupHoldings(wallet).catch(() => null),
    jupPositions(wallet).catch(() => null),
    jupStakedJup(wallet),
  ]);

  const sol = (holdingsRes?.uiAmount ?? Number(holdingsRes?.uiAmountString)) || 0;
  const tokenMap = holdingsRes?.tokens || {};

  const mints = Object.keys(tokenMap);
  // always price SOL + USDC
  const priceMints = [...new Set([WSOL, USDC, ...mints])];

  // tokenInfo prices from positions if present
  const tokenInfo = positionsRes?.tokenInfo?.solana || {};
  const infoPrices: Record<string, number> = {};
  for (const [mint, info] of Object.entries(tokenInfo)) {
    if (typeof info?.price === "number") infoPrices[mint] = info.price;
  }

  const prices = { ...infoPrices, ...(await jupPrices(priceMints)) };

  const tokens: JupTokenBalance[] = [];
  let usdc = 0;

  for (const [mint, accounts] of Object.entries(tokenMap)) {
    const s = sumUi(accounts);
    if (!(s.uiAmount > 0)) continue;
    const priceUsd = prices[mint] ?? null;
    const valueUsd =
      priceUsd != null && Number.isFinite(priceUsd) ? s.uiAmount * priceUsd : null;
    const meta = tokenInfo[mint];
    if (mint === USDC) usdc = s.uiAmount;
    tokens.push({
      mint,
      amount: s.amount,
      uiAmount: s.uiAmount,
      decimals: s.decimals,
      isFrozen: s.isFrozen,
      priceUsd,
      valueUsd,
      symbol: meta?.symbol ?? (mint === USDC ? "USDC" : mint === WSOL ? "SOL" : null),
      name: meta?.name ?? null,
      logoUri: meta?.logoURI ?? null,
      programId: s.programId ?? null,
    });
  }

  tokens.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  // Enrich meme coins missing logo/symbol (holdings API often has none)
  const needMeta = tokens
    .filter((t) => !t.logoUri || !t.symbol || !t.name || !t.programId)
    .map((t) => t.mint)
    .slice(0, 24);
  if (needMeta.length) {
    try {
      const { tokenSearch } = await import("@/lib/jup-ultra");
      await Promise.all(
        needMeta.map(async (mint) => {
          try {
            const hits = await tokenSearch(mint);
            const hit = hits.find(
              (h) => h.id === mint || h.id?.toLowerCase() === mint.toLowerCase(),
            ) as
              | (import("@/lib/jup-ultra").TokenHit & { tokenProgram?: string })
              | undefined;
            if (!hit) return;
            const t = tokens.find((x) => x.mint === mint);
            if (!t) return;
            if (!t.symbol && hit.symbol) t.symbol = hit.symbol;
            if (!t.name && hit.name) t.name = hit.name;
            if (!t.logoUri && hit.icon) t.logoUri = hit.icon;
            if (!t.programId && hit.tokenProgram) t.programId = hit.tokenProgram;
            if (t.priceUsd == null && typeof hit.usdPrice === "number") {
              t.priceUsd = hit.usdPrice;
              t.valueUsd = t.uiAmount * hit.usdPrice;
            }
          } catch {
            /* skip mint */
          }
        }),
      );
    } catch {
      /* ignore enrich failures */
    }
  }

  const positions = Array.isArray(positionsRes?.elements) ? positionsRes!.elements! : [];
  const positionsUsd = positions.reduce((acc, el) => {
    const v = typeof el.value === "number" ? el.value : 0;
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);

  const tokensUsd = tokens.reduce((acc, t) => acc + (t.valueUsd ?? 0), 0);
  const solPrice = prices[WSOL] ?? null;
  const solUsd = solPrice != null ? sol * solPrice : 0;

  // staked JUP rough value if amount present
  let stakedJupUsd = 0;
  const stakedAmt = Number(stakedRes?.stakedAmount || 0);
  if (stakedAmt > 0) {
    // JUP mint
    const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
    const jupPrice = prices[JUP] ?? (await jupPrices([JUP]))[JUP] ?? null;
    if (jupPrice != null) stakedJupUsd = stakedAmt * jupPrice;
  }

  // net worth: SOL + token values + positions (positions may already include some wallet value — Jupiter docs say Wallet label elements exist). Prefer max of (spot, spot+positions excluding wallet-labeled) 
  const nonWalletPositionsUsd = positions.reduce((acc, el) => {
    const label = (el.label || "").toLowerCase();
    if (label === "wallet") return acc;
    const v = typeof el.value === "number" ? el.value : 0;
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);

  const spotUsd = solUsd + tokensUsd;
  const netWorthUsd = spotUsd + nonWalletPositionsUsd + stakedJupUsd;

  return {
    wallet,
    sol: Number.isFinite(sol) ? sol : 0,
    usdc,
    tokens,
    positions,
    stakedJup: stakedRes,
    totals: {
      tokensUsd: spotUsd,
      positionsUsd: nonWalletPositionsUsd,
      stakedJupUsd,
      netWorthUsd,
    },
    source: "jupiter",
    fetchedAt: new Date().toISOString(),
  };
}
