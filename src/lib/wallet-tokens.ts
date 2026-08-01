/**
 * Wallet SPL holdings for send/gift pickers — icon, meta, USD price.
 */
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const SOL_ICON =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
export const USDC_ICON =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png";

export type WalletToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  uiAmount: number;
  amount: string;
  icon?: string;
  programId: string;
  isNativeSol?: boolean;
  /** USD per 1 token */
  priceUsd?: number | null;
  /** uiAmount × priceUsd */
  valueUsd?: number | null;
};

type Meta = {
  symbol: string;
  name: string;
  icon?: string;
  priceUsd?: number | null;
};

const META_CACHE = new Map<string, Meta>();

function shortMint(m: string) {
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

export function formatTokenUi(n: number, decimals = 6): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const d = n >= 1 ? Math.min(4, decimals) : Math.min(6, decimals);
  return n.toFixed(d).replace(/\.?0+$/, "") || "0";
}

export function formatUsd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (opts?.compact) {
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  }
  if (abs >= 1000) {
    return n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }
  if (abs >= 1) {
    return `$${n.toFixed(2)}`;
  }
  if (abs >= 0.01) {
    return `$${n.toFixed(4)}`;
  }
  if (abs > 0) {
    return `$${n.toPrecision(2)}`;
  }
  return "$0.00";
}

export function formatUsdPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return formatUsd(n);
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toPrecision(3)}`;
  return "$0";
}

export function uiToRawAmount(ui: number, decimals: number): bigint {
  if (!Number.isFinite(ui) || ui <= 0) return BigInt(0);
  const s = ui.toFixed(decimals);
  const [w, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const raw = `${w.replace(/^0+/, "") || "0"}${frac}`.replace(/^0+/, "") || "0";
  return BigInt(raw);
}

/** Client: batch Jupiter prices via our API. */
export async function fetchPricesClient(
  mints: string[]
): Promise<Record<string, number>> {
  const unique = [...new Set(mints.filter(Boolean))];
  if (!unique.length) return {};
  try {
    const r = await fetch(`/api/prices?ids=${unique.map(encodeURIComponent).join(",")}`, {
      cache: "no-store",
    });
    if (!r.ok) return {};
    const j = (await r.json()) as { prices?: Record<string, number> };
    return j.prices || {};
  } catch {
    return {};
  }
}

export async function fetchTokenMeta(mints: string[]): Promise<void> {
  const missing = mints.filter((m) => m !== NATIVE_SOL_MINT && !META_CACHE.has(m));
  if (!missing.length) return;
  await Promise.all(
    missing.slice(0, 40).map(async (mint) => {
      try {
        const r = await fetch(`/api/swap/search?q=${encodeURIComponent(mint)}`, {
          cache: "force-cache",
        });
        const j = (await r.json()) as {
          tokens?: {
            id: string;
            symbol?: string;
            name?: string;
            icon?: string;
            usdPrice?: number;
          }[];
        };
        const hit = (j.tokens || []).find((t) => t.id === mint);
        if (hit) {
          META_CACHE.set(mint, {
            symbol: hit.symbol || shortMint(mint),
            name: hit.name || hit.symbol || shortMint(mint),
            icon: hit.icon,
            priceUsd: typeof hit.usdPrice === "number" ? hit.usdPrice : undefined,
          });
        } else {
          META_CACHE.set(mint, { symbol: shortMint(mint), name: shortMint(mint) });
        }
      } catch {
        META_CACHE.set(mint, { symbol: shortMint(mint), name: shortMint(mint) });
      }
    })
  );
}

/**
 * Preferred path: Jupiter portfolio snapshot (icons + USD).
 * Fallback: RPC token accounts + search meta + /api/prices.
 */
export async function fetchWalletTokens(
  connection: Connection,
  owner: string,
  opts?: { solBalance?: number | null }
): Promise<WalletToken[]> {
  // ── Portfolio-first ────────────────────────────────────────────────
  try {
    const pr = await fetch(`/api/portfolio?wallet=${encodeURIComponent(owner)}`, {
      cache: "no-store",
    });
    if (pr.ok) {
      const pj = (await pr.json()) as {
        ok?: boolean;
        sol?: number;
        usdc?: number;
        tokens?: {
          mint: string;
          symbol?: string | null;
          name?: string | null;
          logoUri?: string | null;
          icon?: string | null;
          decimals?: number;
          uiAmount?: number;
          amount?: string;
          priceUsd?: number | null;
          valueUsd?: number | null;
          programId?: string;
        }[];
      };
      if (pj.ok !== false) {
        const solUi =
          typeof pj.sol === "number"
            ? pj.sol
            : opts?.solBalance ?? (await connection.getBalance(new PublicKey(owner))) / LAMPORTS_PER_SOL;

        const out: WalletToken[] = [
          {
            mint: NATIVE_SOL_MINT,
            symbol: "SOL",
            name: "Solana",
            decimals: 9,
            uiAmount: solUi,
            amount: String(Math.round(solUi * LAMPORTS_PER_SOL)),
            icon: SOL_ICON,
            isNativeSol: true,
            programId: TOKEN_PROGRAM_ID.toBase58(),
            priceUsd: null,
            valueUsd: null,
          },
        ];

        const seen = new Set<string>([NATIVE_SOL_MINT]);
        for (const t of pj.tokens || []) {
          if (!t.mint || seen.has(t.mint)) continue;
          if (t.mint === NATIVE_SOL_MINT) continue;
          const ui = t.uiAmount ?? 0;
          if (!(ui > 0)) continue;
          seen.add(t.mint);
          const isUsdc = t.mint === USDC_MAINNET || t.mint === USDC_DEVNET;
          out.push({
            mint: t.mint,
            symbol: t.symbol || (isUsdc ? "USDC" : shortMint(t.mint)),
            name: t.name || t.symbol || (isUsdc ? "USD Coin" : shortMint(t.mint)),
            decimals: t.decimals ?? 6,
            uiAmount: ui,
            amount: t.amount || String(Math.round(ui * 10 ** (t.decimals ?? 6))),
            icon: t.logoUri || t.icon || (isUsdc ? USDC_ICON : undefined),
            programId: t.programId || TOKEN_PROGRAM_ID.toBase58(),
            priceUsd: t.priceUsd ?? null,
            valueUsd: t.valueUsd ?? null,
          });
        }

        // Fill missing prices
        const needPrice = out.filter((t) => t.priceUsd == null).map((t) => t.mint);
        if (needPrice.length) {
          const prices = await fetchPricesClient(needPrice);
          for (const t of out) {
            if (t.priceUsd == null && prices[t.mint] != null) {
              t.priceUsd = prices[t.mint];
              t.valueUsd = t.uiAmount * prices[t.mint];
            }
          }
        }

        // SOL icon already set; ensure USDC icon
        for (const t of out) {
          if ((t.mint === USDC_MAINNET || t.mint === USDC_DEVNET) && !t.icon) {
            t.icon = USDC_ICON;
          }
        }

        out.sort((a, b) => {
          if (a.isNativeSol) return -1;
          if (b.isNativeSol) return 1;
          if (a.symbol === "USDC") return -1;
          if (b.symbol === "USDC") return 1;
          return (b.valueUsd ?? b.uiAmount) - (a.valueUsd ?? a.uiAmount);
        });
        return out;
      }
    }
  } catch {
    /* fall through to RPC */
  }

  // ── RPC fallback ───────────────────────────────────────────────────
  const ownerPk = new PublicKey(owner);
  const out: WalletToken[] = [];

  const solUi =
    opts?.solBalance ?? (await connection.getBalance(ownerPk)) / LAMPORTS_PER_SOL;
  out.push({
    mint: NATIVE_SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    uiAmount: solUi,
    amount: String(Math.round(solUi * LAMPORTS_PER_SOL)),
    icon: SOL_ICON,
    isNativeSol: true,
    programId: TOKEN_PROGRAM_ID.toBase58(),
  });

  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const res = await connection.getParsedTokenAccountsByOwner(ownerPk, {
        programId,
      });
      for (const { account } of res.value) {
        const info = account.data.parsed?.info;
        if (!info) continue;
        const mint = info.mint as string;
        const ta = info.tokenAmount as {
          amount: string;
          decimals: number;
          uiAmount: number | null;
          uiAmountString?: string;
        };
        const ui =
          ta.uiAmount ??
          (ta.uiAmountString
            ? Number(ta.uiAmountString)
            : Number(ta.amount) / 10 ** ta.decimals);
        if (!ui || ui <= 0) continue;
        if (mint === NATIVE_SOL_MINT) continue;
        out.push({
          mint,
          symbol: shortMint(mint),
          name: shortMint(mint),
          decimals: ta.decimals,
          uiAmount: ui,
          amount: ta.amount,
          programId: programId.toBase58(),
        });
      }
    } catch {
      /* ignore */
    }
  }

  await fetchTokenMeta(out.map((t) => t.mint));
  const prices = await fetchPricesClient(out.map((t) => t.mint));

  for (const t of out) {
    if (t.isNativeSol) {
      t.priceUsd = prices[NATIVE_SOL_MINT] ?? null;
      t.valueUsd =
        t.priceUsd != null ? t.uiAmount * t.priceUsd : null;
      continue;
    }
    const m = META_CACHE.get(t.mint);
    if (m) {
      t.symbol = m.symbol;
      t.name = m.name;
      t.icon = m.icon;
      if (m.priceUsd != null) t.priceUsd = m.priceUsd;
    }
    if (t.mint === USDC_MAINNET || t.mint === USDC_DEVNET) {
      t.symbol = "USDC";
      t.name = "USD Coin";
      t.icon = t.icon || USDC_ICON;
    }
    if (t.priceUsd == null && prices[t.mint] != null) t.priceUsd = prices[t.mint];
    if (t.priceUsd != null) t.valueUsd = t.uiAmount * t.priceUsd;
  }

  out.sort((a, b) => {
    if (a.isNativeSol) return -1;
    if (b.isNativeSol) return 1;
    if (a.symbol === "USDC") return -1;
    if (b.symbol === "USDC") return 1;
    return (b.valueUsd ?? 0) - (a.valueUsd ?? 0);
  });

  return out;
}
