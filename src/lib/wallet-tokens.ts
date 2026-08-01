/**
 * Wallet SPL holdings for send/gift pickers.
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

export type WalletToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  uiAmount: number;
  amount: string; // raw integer string
  icon?: string;
  /** Tokenkeg or TokenzQd */
  programId: string;
  isNativeSol?: boolean;
};

const META_CACHE = new Map<string, { symbol: string; name: string; icon?: string }>();

function shortMint(m: string) {
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

export async function fetchTokenMeta(mints: string[]): Promise<void> {
  const missing = mints.filter((m) => m !== NATIVE_SOL_MINT && !META_CACHE.has(m));
  if (!missing.length) return;
  // Jupiter search by mint id works for known tokens
  await Promise.all(
    missing.slice(0, 40).map(async (mint) => {
      try {
        const r = await fetch(`/api/swap/search?q=${encodeURIComponent(mint)}`, {
          cache: "force-cache",
        });
        const j = (await r.json()) as {
          tokens?: { id: string; symbol?: string; name?: string; icon?: string }[];
        };
        const hit = (j.tokens || []).find((t) => t.id === mint) || j.tokens?.[0];
        if (hit && hit.id === mint) {
          META_CACHE.set(mint, {
            symbol: hit.symbol || shortMint(mint),
            name: hit.name || hit.symbol || shortMint(mint),
            icon: hit.icon,
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

export async function fetchWalletTokens(
  connection: Connection,
  owner: string,
  opts?: { solBalance?: number | null }
): Promise<WalletToken[]> {
  const ownerPk = new PublicKey(owner);
  const out: WalletToken[] = [];

  const solUi = opts?.solBalance ?? (await connection.getBalance(ownerPk)) / LAMPORTS_PER_SOL;
  out.push({
    mint: NATIVE_SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    uiAmount: solUi,
    amount: String(Math.round(solUi * LAMPORTS_PER_SOL)),
    isNativeSol: true,
    programId: TOKEN_PROGRAM_ID.toBase58(),
  });

  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  for (const programId of programs) {
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
          (ta.uiAmountString ? Number(ta.uiAmountString) : Number(ta.amount) / 10 ** ta.decimals);
        if (!ui || ui <= 0) continue;
        // skip wrapped SOL ATA — we show native SOL
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
      /* ignore program */
    }
  }

  // Prefer portfolio API symbols when available
  try {
    const pr = await fetch(`/api/portfolio?wallet=${encodeURIComponent(owner)}`, {
      cache: "no-store",
    });
    if (pr.ok) {
      const pj = (await pr.json()) as {
        tokens?: {
          mint: string;
          symbol?: string;
          name?: string;
          icon?: string;
          decimals?: number;
          uiAmount?: number;
        }[];
      };
      for (const t of pj.tokens || []) {
        META_CACHE.set(t.mint, {
          symbol: t.symbol || shortMint(t.mint),
          name: t.name || t.symbol || shortMint(t.mint),
          icon: t.icon,
        });
      }
    }
  } catch {
    /* optional */
  }

  await fetchTokenMeta(out.map((t) => t.mint));

  for (const t of out) {
    if (t.isNativeSol) continue;
    const m = META_CACHE.get(t.mint);
    if (m) {
      t.symbol = m.symbol;
      t.name = m.name;
      t.icon = m.icon;
    }
    if (t.mint === USDC_MAINNET || t.mint === USDC_DEVNET) {
      t.symbol = "USDC";
      t.name = "USD Coin";
    }
  }

  // Sort: SOL, USDC, then by uiAmount desc
  out.sort((a, b) => {
    if (a.isNativeSol) return -1;
    if (b.isNativeSol) return 1;
    if (a.symbol === "USDC") return -1;
    if (b.symbol === "USDC") return 1;
    return (b.uiAmount || 0) - (a.uiAmount || 0);
  });

  return out;
}

export function uiToRawAmount(ui: number, decimals: number): bigint {
  if (!Number.isFinite(ui) || ui <= 0) return BigInt(0);
  const s = ui.toFixed(decimals);
  const [w, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const raw = `${w.replace(/^0+/, "") || "0"}${frac}`.replace(/^0+/, "") || "0";
  return BigInt(raw);
}

export function formatTokenUi(n: number, decimals = 6): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const d = n >= 1 ? Math.min(4, decimals) : Math.min(6, decimals);
  return n.toFixed(d).replace(/\.?0+$/, "") || "0";
}
