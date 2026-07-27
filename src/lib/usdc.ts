import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export function usdcMint(network: "mainnet" | "devnet"): PublicKey {
  return new PublicKey(network === "devnet" ? USDC_DEVNET_MINT : USDC_MAINNET_MINT);
}

export async function getUsdcBalance(
  conn: Connection,
  owner: PublicKey,
  network: "mainnet" | "devnet",
): Promise<number> {
  const ata = getAssociatedTokenAddressSync(usdcMint(network), owner, true, TOKEN_PROGRAM_ID);
  try {
    const res = await conn.getTokenAccountBalance(ata, "confirmed");
    return Number(res.value.uiAmount ?? 0);
  } catch {
    return 0;
  }
}
