/**
 * Mobula market lookup (server-only).
 * Env: MOBULA_API_KEY
 * Docs: https://docs.mobula.io/guides/how-to-get-in-depth-token-details
 */

const MOBULA_API = "https://api.mobula.io/api/1";

function mobulaKey(): string | null {
  return process.env.MOBULA_API_KEY?.trim() || null;
}

export function mobulaConfigured(): boolean {
  return Boolean(mobulaKey());
}

export type MobulaMint = {
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  launchpad: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function pickLaunchpad(data: Record<string, unknown>): string | null {
  const direct =
    str(data.launchpad) ||
    str(data.launchpadName) ||
    str(data.platform) ||
    str(data.protocol);
  if (direct) return direct;
  const contracts = data.contracts;
  if (Array.isArray(contracts) && contracts[0] && typeof contracts[0] === "object") {
    const c = contracts[0] as Record<string, unknown>;
    return str(c.launchpad) || str(c.factory) || str(c.platform) || null;
  }
  return null;
}

export async function mobulaMintLookup(mint: string): Promise<MobulaMint | null> {
  const key = mobulaKey();
  if (!key) return null;
  const url = `${MOBULA_API}/market/data?asset=${encodeURIComponent(mint)}&blockchain=solana`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: key,
      "x-api-key": key,
      "User-Agent": "sol.new/1.0 (+https://sol.new)",
    },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Record<string, unknown> };
  const data = json.data;
  if (!data || typeof data !== "object") return null;
  return {
    name: str(data.name),
    symbol: str(data.symbol),
    logo: str(data.logo) || str(data.logoURI) || str(data.image),
    priceUsd: num(data.price),
    marketCapUsd: num(data.market_cap) ?? num(data.marketCap),
    volume24h: num(data.volume) ?? num(data.volume_24h),
    liquidityUsd: num(data.liquidity),
    website: str(data.website) || str(data.official_website),
    twitter: str(data.twitter),
    telegram: str(data.telegram),
    launchpad: pickLaunchpad(data),
  };
}
