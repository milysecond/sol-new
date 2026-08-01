import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
} from "@solana/spl-token";

export type WalletToken = {
  mint: string;
  /** ATA / token account pubkey */
  account: string;
  amount: string; // base units
  decimals: number;
  uiAmount: number;
  program: "spl" | "token2022";
  /** true when mint is wrapped SOL */
  isWsol: boolean;
  symbol?: string;
  name?: string;
  logoUri?: string;
};

const WSOL = NATIVE_MINT.toBase58();

export function isWsolMint(mint: string): boolean {
  return mint === WSOL;
}

export async function fetchWalletTokens(
  connection: Connection,
  owner: PublicKey | string,
): Promise<WalletToken[]> {
  const ownerPk = typeof owner === "string" ? new PublicKey(owner) : owner;
  const [spl, t22] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const out: WalletToken[] = [];
  for (const { pubkey, account } of [...spl.value, ...t22.value]) {
    const parsed = account.data.parsed as {
      info?: {
        mint?: string;
        tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number | null };
      };
    };
    const info = parsed?.info;
    if (!info?.mint || !info.tokenAmount) continue;
    const amount = info.tokenAmount.amount || "0";
    if (amount === "0") continue;
    const decimals = info.tokenAmount.decimals ?? 0;
    const uiAmount =
      info.tokenAmount.uiAmount ?? Number(amount) / 10 ** decimals;
    const isT22 = account.owner.equals(TOKEN_2022_PROGRAM_ID);
    out.push({
      mint: info.mint,
      account: pubkey.toBase58(),
      amount,
      decimals,
      uiAmount,
      program: isT22 ? "token2022" : "spl",
      isWsol: isWsolMint(info.mint),
      symbol: isWsolMint(info.mint) ? "WSOL" : undefined,
      name: isWsolMint(info.mint) ? "Wrapped SOL" : undefined,
    });
  }

  // Prefer largest balances first; WSOL near top among equals
  out.sort((a, b) => {
    if (a.isWsol !== b.isWsol) return a.isWsol ? -1 : 1;
    return b.uiAmount - a.uiAmount;
  });
  return out;
}

/** Short label for UI */
export function tokenLabel(t: Pick<WalletToken, "mint" | "symbol" | "isWsol">): string {
  if (t.isWsol || t.symbol === "WSOL") return "WSOL";
  if (t.symbol) return t.symbol;
  return `${t.mint.slice(0, 4)}…${t.mint.slice(-4)}`;
}

export function formatTokenAmount(ui: number, decimals: number): string {
  if (!Number.isFinite(ui)) return "0";
  if (ui >= 1_000_000) return ui.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (ui >= 1) return ui.toLocaleString(undefined, { maximumFractionDigits: Math.min(4, decimals) });
  return ui.toLocaleString(undefined, { maximumFractionDigits: Math.min(6, decimals) });
}
