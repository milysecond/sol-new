import { PublicKey } from "@solana/web3.js";

/** Float launchpad program (mainnet). */
export const FLOAT_PROGRAM_ID = new PublicKey("3KguFi7YYzLgttG46fRism16CfcuNCkDh6U7td9JTqxX");

/**
 * Raydium LaunchLab on mainnet.
 * Float's published IDL pins `DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6`,
 * which is LaunchLab on devnet. Live Float pools, platform configs, and
 * quote global configs are owned by the mainnet program below.
 */
export const LAUNCHLAB_PROGRAM_ID = new PublicKey("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj");

/** LaunchLab on devnet. Not used for sol.new/float (Float config is mainnet-only). */
export const LAUNCHLAB_DEVNET_PROGRAM_ID = new PublicKey("DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6");

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
export const RENT_SYSVAR = new PublicKey("SysvarRent111111111111111111111111111111111");

export const LAUNCH_DISCRIMINATOR = Buffer.from([153, 241, 93, 225, 22, 69, 74, 61]);
export const LAUNCH_KEYED_DISCRIMINATOR = Buffer.from([16, 34, 186, 164, 179, 227, 101, 126]);

export const CONFIG_DISCRIMINATOR = Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]);
export const QUOTE_DISCRIMINATOR = Buffer.from([220, 32, 200, 14, 14, 235, 152, 92]);
export const TICKER_DISCRIMINATOR = Buffer.from([98, 30, 187, 162, 15, 209, 205, 227]);

/** LaunchLab's own curve fee, in the same units as Config.tier_fee_rates (10_000 = 1%). */
export const RAYDIUM_CURVE_FEE_UNITS = BigInt(2500);

/**
 * Age-based ticker takeover schedule compiled into the Float program
 * (cheapest step is 3 SOL, then the flat config fee). Ages are seconds
 * since the ticker was claimed.
 */
export const TAKEOVER_STEPS: { maxAgeSecs: number; lamports: bigint }[] = [
  { maxAgeSecs: 15, lamports: BigInt(5_000_000_000) },
  { maxAgeSecs: 60, lamports: BigInt(4_000_000_000) },
  { maxAgeSecs: 3600, lamports: BigInt(3_000_000_000) },
];

/** Vanity mints for `launch_keyed` end with this base58 suffix. */
export const VANITY_SUFFIX = "fLoat";

export const FLOAT_TOKEN_URL = (mint: string) => `https://www.floatlaunch.xyz/tokens/${mint}`;
