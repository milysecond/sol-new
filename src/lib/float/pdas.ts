import { PublicKey } from "@solana/web3.js";
import { u64le } from "./bytes";
import { FLOAT_PROGRAM_ID, LAUNCHLAB_PROGRAM_ID, METADATA_PROGRAM_ID } from "./constants";

export { u64le };

function pda(seeds: Buffer[], program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, program)[0];
}

export function configPda(): PublicKey {
  return pda([Buffer.from("config")], FLOAT_PROGRAM_ID);
}

export function quoteAssetPda(quoteMint: PublicKey): PublicKey {
  return pda([Buffer.from("quote"), quoteMint.toBuffer()], FLOAT_PROGRAM_ID);
}

/** Ticker records are keyed by the uppercase ticker. */
export function tickerPda(ticker: string): PublicKey {
  return pda([Buffer.from("ticker"), Buffer.from(ticker.toUpperCase(), "utf8")], FLOAT_PROGRAM_ID);
}

export function coinMintPda(creator: PublicKey, nonce: bigint): PublicKey {
  return pda([Buffer.from("mint"), creator.toBuffer(), u64le(nonce)], FLOAT_PROGRAM_ID);
}

export function launchPda(coinMint: PublicKey): PublicKey {
  return pda([Buffer.from("launch"), coinMint.toBuffer()], FLOAT_PROGRAM_ID);
}

export function coinVaultPda(coinMint: PublicKey): PublicKey {
  return pda([Buffer.from("coin"), coinMint.toBuffer()], FLOAT_PROGRAM_ID);
}

/** Float's per-tier platform signer. LaunchLab's platform account is derived from this. */
export function floatPlatformPda(tier: number): PublicKey {
  return pda([Buffer.from("platform"), Buffer.from([tier])], FLOAT_PROGRAM_ID);
}

export function launchlabPlatformPda(tier: number): PublicKey {
  return pda(
    [Buffer.from("platform_config"), floatPlatformPda(tier).toBuffer()],
    LAUNCHLAB_PROGRAM_ID,
  );
}

export function launchlabAuthority(): PublicKey {
  return pda([Buffer.from("vault_auth_seed")], LAUNCHLAB_PROGRAM_ID);
}

export function launchlabEventAuthority(): PublicKey {
  return pda([Buffer.from("__event_authority")], LAUNCHLAB_PROGRAM_ID);
}

export function poolPda(coinMint: PublicKey, quoteMint: PublicKey): PublicKey {
  return pda(
    [Buffer.from("pool"), coinMint.toBuffer(), quoteMint.toBuffer()],
    LAUNCHLAB_PROGRAM_ID,
  );
}

export function poolVaultPda(pool: PublicKey, mint: PublicKey): PublicKey {
  return pda([Buffer.from("pool_vault"), pool.toBuffer(), mint.toBuffer()], LAUNCHLAB_PROGRAM_ID);
}

export function metadataPda(mint: PublicKey): PublicKey {
  return pda(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );
}
