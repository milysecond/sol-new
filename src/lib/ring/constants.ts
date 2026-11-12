/**
 * Helius Privacy Rings (Solana Privacy Rings) on the permissionless Default Ring.
 *
 * Program IDs were checked on mainnet before use: both accounts are executable
 * BPF-upgradeable programs. They also match ZOLANA_PROGRAM_IDS in
 * @heliuslabs/spr-web-prover 0.7.0-alpha and the IDs @heliuslabs/spr 0.9.0-alpha
 * encodes into its instructions.
 */
export const RING_SHIELDED_POOL_PROGRAM_ID = "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW";
export const RING_USER_REGISTRY_PROGRAM_ID = "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ";

/** Mainnet USDC. */
export const RING_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type RingAssetId = "SOL" | "USDC";

export type RingAsset = {
  id: RingAssetId;
  symbol: string;
  decimals: number;
  /** Mint for SPL assets; SOL uses the SDK's SOL_MINT at runtime. */
  mint: string | null;
};

export const RING_ASSETS: Record<RingAssetId, RingAsset> = {
  SOL: { id: "SOL", symbol: "SOL", decimals: 9, mint: null },
  USDC: { id: "USDC", symbol: "USDC", decimals: 6, mint: RING_USDC_MINT },
};

/** Same-origin proxy paths. Named Helius hosts never reach the browser. */
export const RING_RPC_PATH = "/api/ring/rpc";
export const RING_SPR_PATH = "/api/ring/spr";
export const RING_STATUS_PATH = "/api/ring/status";

/**
 * Loopback prover URL. The SDK sends `/prove` requests here and
 * SprWebProver.createFetch() answers them in a browser worker, so witnesses
 * and nullifier keys never leave the device. Nothing listens on this port.
 */
export const RING_LOCAL_PROVER_URL = "http://127.0.0.1:3001";

/**
 * Most notes one local proof spends. Mirrors the official web wallet example
 * (MAX_LOCAL_INPUTS = 8). More notes than this need a merge first.
 */
export const RING_MAX_LOCAL_INPUTS = 8;

/** Fee for the whole transaction (not per compute unit). */
export const RING_PRIORITY_FEE_LAMPORTS = BigInt(10_000);

/**
 * Public SOL a pay link carries so the claimer needs no SOL of their own.
 *
 * Covers, on the claimer's first Ring use: the registry record rent
 * (100-byte account = 1,158,240 lamports on mainnet), the registration fee
 * (2 signatures), the private transfer fee plus priority fee, and the final
 * sweep. The link wallet must stay rent-exempt (890,880 lamports) until the
 * sweep closes it, so the budget includes that floor. Whatever is left goes
 * to the claimer as public SOL.
 */
export const RING_LINK_FEE_LAMPORTS = BigInt(2_500_000);
export const RING_REGISTRY_RECORD_RENT_LAMPORTS = BigInt(1_158_240);
export const RING_SYSTEM_ACCOUNT_RENT_LAMPORTS = BigInt(890_880);
export const RING_SIGNATURE_FEE_LAMPORTS = BigInt(5_000);

/** Pay-link route. Secret goes after `#` only. */
export const RING_LINK_PREFIX = "/ring/c";

export const RING_STORAGE_PREFIX = "sol.new.ring";

/**
 * Public SOL kept back when shielding SOL, so the shield and the private
 * proof that follows can still pay their network fees.
 */
export const RING_FEE_RESERVE_LAMPORTS = BigInt(5_000_000);

/** Least public SOL a private action (send, link, unshield, merge) needs for its fee. */
export const RING_MIN_FEE_LAMPORTS = BigInt(100_000);

/** Joining the Default Ring: registry record rent plus two signatures and the priority fee. */
export const RING_JOIN_COST_LAMPORTS =
  RING_REGISTRY_RECORD_RENT_LAMPORTS + RING_SIGNATURE_FEE_LAMPORTS * BigInt(2) + RING_PRIORITY_FEE_LAMPORTS;
