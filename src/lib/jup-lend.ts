/**
 * Jupiter Lend client (server-only).
 * Earn: deposit/withdraw · Borrow: vaults/positions/operate
 *
 * Env: JUP_API_KEY (or JUPITER_API_KEY)
 * Docs: https://dev.jup.ag/docs/lend
 */

const JUP_LEND_BASE = "https://api.jup.ag/lend/v1";

export function jupLendConfigured(): boolean {
  return Boolean(jupApiKey());
}

function jupApiKey(): string | null {
  return (
    process.env.JUP_API_KEY?.trim() ||
    process.env.JUPITER_API_KEY?.trim() ||
    null
  );
}

function authHeaders(): HeadersInit {
  const key = jupApiKey();
  if (!key) throw new Error("JUP_API_KEY not configured");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "sol.new/1.0 (+https://sol.new)",
    "x-api-key": key,
  };
}

export type JupJson = Record<string, unknown>;

async function jupFetch<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<{ ok: boolean; status: number; data: T }> {
  const method = init?.method || (init?.json !== undefined ? "POST" : "GET");
  const res = await fetch(`${JUP_LEND_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: authHeaders(),
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { raw: text } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

// ─── Earn ────────────────────────────────────────────────────────────────────

export type EarnToken = {
  id: number;
  address: string;
  name: string;
  symbol: string;
  uiSymbol?: string;
  decimals: number;
  assetAddress: string;
  asset?: {
    address: string;
    name?: string;
    symbol?: string;
    uiSymbol?: string;
    decimals?: number;
    logoUrl?: string;
    price?: string;
  };
  totalAssets?: string;
  totalSupply?: string;
  supplyRate?: string;
  rewardsRate?: string;
  totalRate?: string;
  liquiditySupplyData?: {
    withdrawable?: string;
    withdrawalLimit?: string;
  };
};

export async function jupEarnTokens() {
  return jupFetch<EarnToken[]>("/earn/tokens");
}

export async function jupEarnPositions(wallet: string) {
  return jupFetch<unknown[]>(`/earn/positions?users=${encodeURIComponent(wallet)}`);
}

export async function jupEarnEarnings(wallet: string) {
  return jupFetch<unknown[]>(`/earn/earnings?users=${encodeURIComponent(wallet)}`);
}

export async function jupEarnDeposit(opts: {
  asset: string;
  signer: string;
  amount: string;
}) {
  return jupFetch<{ transaction?: string }>("/earn/deposit", { json: opts });
}

export async function jupEarnWithdraw(opts: {
  asset: string;
  signer: string;
  amount: string;
}) {
  return jupFetch<{ transaction?: string }>("/earn/withdraw", { json: opts });
}

// ─── Borrow ──────────────────────────────────────────────────────────────────

export type BorrowVault = {
  id: number;
  address: string;
  supplyToken: {
    address: string;
    name?: string;
    symbol?: string;
    uiSymbol?: string;
    decimals: number;
    logoUrl?: string;
    price?: string;
  };
  borrowToken: {
    address: string;
    name?: string;
    symbol?: string;
    uiSymbol?: string;
    decimals: number;
    logoUrl?: string;
    price?: string;
  };
  totalSupply?: string;
  totalBorrow?: string;
  collateralFactor?: string;
  liquidationThreshold?: string;
  borrowRate?: string;
  supplyRate?: string;
  borrowable?: string;
  withdrawable?: string;
  minimumBorrowing?: string;
  totalPositions?: number;
};

export async function jupBorrowVaults(market = "main") {
  const q = market && market !== "main" ? `?market=${encodeURIComponent(market)}` : "";
  return jupFetch<BorrowVault[]>(`/borrow/vaults${q}`);
}

export async function jupBorrowPositions(wallet: string, market = "main") {
  const m = market && market !== "main" ? `&market=${encodeURIComponent(market)}` : "";
  return jupFetch<unknown[]>(
    `/borrow/positions?users=${encodeURIComponent(wallet)}${m}`
  );
}

/** Positive col/debt = deposit/borrow; negative = withdraw/repay. positionId 0 = new. */
export async function jupBorrowOperate(opts: {
  vaultId: number;
  positionId: number;
  signer: string;
  colAmount: string;
  debtAmount: string;
  positionOwner?: string;
  market?: string;
}) {
  const { market, ...body } = opts;
  const q = market && market !== "main" ? `?market=${encodeURIComponent(market)}` : "";
  return jupFetch<{ transaction?: string; nftId?: number }>(`/borrow/operate${q}`, {
    json: body,
  });
}

/** Rate basis points → percent string (471 → "4.71%") */
export function bpsToPct(bps: string | number | undefined | null): string {
  if (bps == null || bps === "") return "—";
  const n = Number(bps);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 100).toFixed(2)}%`;
}

export function formatBaseUnits(
  raw: string | number | undefined | null,
  decimals: number
): string {
  if (raw == null || raw === "") return "0";
  try {
    const neg = String(raw).startsWith("-");
    const s = String(raw).replace(/^-/, "");
    if (!/^\d+$/.test(s)) return String(raw);
    const pad = s.padStart(decimals + 1, "0");
    const whole = pad.slice(0, -decimals) || "0";
    const frac = pad.slice(-decimals).replace(/0+$/, "");
    const out = frac ? `${whole}.${frac}` : whole;
    return neg ? `-${out}` : out;
  } catch {
    return String(raw);
  }
}

export function toBaseUnits(amount: string, decimals: number): string | null {
  const t = amount.trim();
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  if (f.length > decimals) return null;
  const frac = f.padEnd(decimals, "0");
  const combined = `${w}${frac}`.replace(/^0+(?=\d)/, "");
  return combined || "0";
}
