import type { Keypair } from "@solana/web3.js";

export type WalletType = "legacy" | "smart";

export interface WalletEntryV2 {
  v: 2;
  type: WalletType;
  /** legacy: ed25519 pubkey · smart: LazorKit smart-wallet address (holds the funds) */
  address: string;
  /** WebAuthn credential id (base64) — both types */
  credentialId: string;
  label: string;
  /** smart-only: compressed P-256 passkey pubkey, base64 (server-side signature verify) */
  passkeyPubkey?: string;
  /** set after a sweep-upgrade: the smart wallet this legacy wallet was drained into */
  upgradedTo?: string;
}

/** Off-chain message signature — server verifies via src/lib/verify-signature.ts */
export type SignedMessage =
  | { type: "ed25519"; signer: string; signature: string /* bs58 */ }
  | {
      type: "webauthn";
      signer: string;
      credentialId: string;
      /* base64: */
      signature: string;
      authenticatorData: string;
      clientDataJSON: string;
    };

export interface SignAndSendOpts {
  /** Ephemeral tx-level co-signers (mint keypairs). Smart wallets route these
   *  through /api/relay server-side co-sign — the LazorKit SDK has no
   *  extra-signers support (SPIKES.md, SPIKE-2). */
  extraSigners?: Keypair[];
  /** Address lookup tables for large txs (Jupiter). */
  addressLookupTables?: string[];
}

export const WALLETS_V2_KEY = "sol.new.wallets.v2";
export const WALLET_TYPE_KEY = "sol.new.walletType";
