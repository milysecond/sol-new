// Thin server-side client for the TopLedger API (real-time Solana DeFi
// intelligence — wallet net worth, positions and PnL across 20+ protocols).
// Docs: https://api.topledger.xyz/api-docs
//
// The API key is read server-side only and never reaches the client. Calls go
// through our /api/track route so the key stays secret.

const BASE = "https://api.topledger.xyz";

export class TopLedgerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TopLedgerError";
    this.status = status;
  }
}

async function tlFetch<T>(path: string): Promise<T> {
  const key = process.env.TOPLEDGER_API_KEY;
  if (!key) throw new TopLedgerError(500, "TOPLEDGER_API_KEY not configured");

  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-api-key": key, accept: "application/json" },
    // DeFi positions move constantly — cache briefly to soften bursts without
    // serving stale net worth.
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `TopLedger ${res.status}`;
    try {
      const j = JSON.parse(body);
      message = j.error || j.message || message;
    } catch {
      if (body) message = body.slice(0, 200);
    }
    throw new TopLedgerError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// --- Response shapes (subset we render; the API returns more) ---

export interface CategoryProtocol {
  protocol: string;
  [k: string]: unknown;
}

export interface AnalyzeResponse {
  wallet: string;
  total_net_worth_usd: number;
  categories: {
    holdings?: { value_usd: number; token_count: number };
    lending?: { deposit_usd: number; borrow_usd: number; net_usd: number; protocols: CategoryProtocol[] };
    perpetuals?: { positions: number; size_usd: number | null; collateral_usd: number | null; pnl_usd: number | null; protocols: CategoryProtocol[] };
    staking?: { value_usd: number; protocols: CategoryProtocol[] };
    lp_positions?: { positions: number; value_usd: number; protocols: CategoryProtocol[] };
    yield?: { value_usd: number; protocols: CategoryProtocol[] };
    rewards?: { pending_usd: number; protocols: CategoryProtocol[] };
    governance?: { value_usd: number | null; protocols: CategoryProtocol[] };
  };
  active_protocols: string[];
}

export interface PnlSummaryResponse {
  wallet: string;
  total_pnl_usd: number;
  unrealized: { pnl_usd: number; pnl_pct: number; cost_basis_usd: number; current_value_usd: number; position_count: number };
  realized_7d: { pnl_usd: number; daily_breakdown: { date: string; realized_pnl_usd: number }[] };
}

export interface Holding {
  mint: string;
  symbol?: string;
  name?: string;
  balance: number;
  price_usd: number;
  value_usd: number;
}

export interface HoldingsResponse {
  wallet: string;
  total_value_usd: number;
  holdings_count: number;
  holdings: Holding[];
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isValidWallet = (w: string) => BASE58.test(w.trim());

export const analyzeWallet = (wallet: string) =>
  tlFetch<AnalyzeResponse>(`/api/wallets/${wallet}/analyze`);

export const walletPnlSummary = (wallet: string) =>
  tlFetch<PnlSummaryResponse>(`/api/wallets/${wallet}/pnl/summary`);

export const walletHoldings = (wallet: string, minValueUsd = 1) =>
  tlFetch<HoldingsResponse>(`/api/wallets/${wallet}/holdings?min_value_usd=${minValueUsd}`);
