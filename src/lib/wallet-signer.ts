import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type AddressLookupTableAccount,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getPasskeyKeypair } from "./passkey-wallet";
import type { SignAndSendOpts, SignedMessage, WalletType } from "./wallet-types";

/**
 * The slice of LazorKit's useWallet() hook that the smart signer needs.
 * WalletProvider captures this from a binder component mounted inside
 * LazorkitProvider (see src/components/lazor-mount.tsx) — hooks can't be
 * called here in a plain module.
 */
export interface LazorHandle {
  smartWalletPubkey: PublicKey | null;
  connect: (options?: { feeMode?: "paymaster" | "user" }) => Promise<{
    credentialId: string;
    passkeyPubkey: number[];
    smartWallet: string;
  }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (payload: {
    instructions: TransactionInstruction[];
    transactionOptions?: {
      addressLookupTableAccounts?: AddressLookupTableAccount[];
      computeUnitLimit?: number;
      clusterSimulation?: "devnet" | "mainnet";
    };
  }) => Promise<string>;
  signMessage: (message: string) => Promise<{ signature: string; signedPayload: string }>;
}

export interface SolNewSigner {
  type: WalletType;
  address: string;
  /** Build, sign, send, and confirm a list of instructions. Returns the signature. */
  signAndSend(ixs: TransactionInstruction[], opts?: SignAndSendOpts): Promise<string>;
  signMessage(message: string): Promise<SignedMessage>;
  /** Legacy-only escape hatch for flows that still need the raw Keypair (multisig, UMI). */
  getLegacyKeypair?(): Promise<Keypair>;
}

async function confirmByPolling(conn: Connection, signature: string, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const st = await conn.getSignatureStatuses([signature]);
    const s = st.value[0];
    if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err).slice(0, 120)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Transaction was not confirmed in time — check the explorer before retrying.");
}

export function makeLegacySigner(address: string, rpc: string): SolNewSigner {
  return {
    type: "legacy",
    address,

    async signAndSend(ixs, opts) {
      const { keypair } = await getPasskeyKeypair();
      if (keypair.publicKey.toBase58() !== address) {
        throw new Error("That passkey belongs to a different wallet.");
      }
      const conn = new Connection(rpc, "confirmed");
      const tx = new Transaction().add(...ixs);
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;
      tx.sign(keypair, ...(opts?.extraSigners ?? []));
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      await confirmByPolling(conn, sig);
      return sig;
    },

    async signMessage(message) {
      const { address: addr, keypair } = await getPasskeyKeypair();
      const sig = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey);
      return { type: "ed25519", signer: addr, signature: bs58.encode(sig) };
    },

    async getLegacyKeypair() {
      const { keypair } = await getPasskeyKeypair();
      return keypair;
    },
  };
}

export function makeSmartSigner(
  lazor: LazorHandle,
  address: string,
  credentialId: string,
  network: "mainnet" | "devnet",
): SolNewSigner {
  return {
    type: "smart",
    address,

    async signAndSend(ixs, opts) {
      if (opts?.extraSigners?.length) {
        // The LazorKit SDK has no extra-signers support (SPIKES.md SPIKE-2);
        // flows with ephemeral mint keypairs go through /api/relay in M3.
        throw new Error("extraSigners not supported on smart wallets yet — route via /api/relay");
      }
      return lazor.signAndSendTransaction({
        instructions: ixs,
        transactionOptions: { clusterSimulation: network },
      });
    },

    async signMessage(message) {
      const out = await lazor.signMessage(message);
      // Payload mapping is provisional until the SPIKE-5 browser capture
      // pins down signedPayload's exact contents (see SPIKES.md).
      return {
        type: "webauthn",
        signer: address,
        credentialId,
        signature: out.signature,
        authenticatorData: "",
        clientDataJSON: out.signedPayload,
      };
    },
  };
}
