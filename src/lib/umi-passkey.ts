/**
 * Creates a UMI instance wired to a @solana/web3.js Keypair (from passkey auth).
 * Call getPasskeyKeypair() first, then pass the result here.
 */
import type { Keypair } from "@solana/web3.js";

export async function createUmiWithKeypair(rpc: string, solanaKeypair: Keypair) {
  const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
  const { genesis } = await import("@metaplex-foundation/genesis");
  const { mplTokenMetadata } = await import("@metaplex-foundation/mpl-token-metadata");
  const { keypairIdentity, createSignerFromKeypair } = await import("@metaplex-foundation/umi");

  const umi = createUmi(rpc).use(genesis()).use(mplTokenMetadata());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(solanaKeypair.secretKey);
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(signer));
  return umi;
}

export async function createUmiReadonly(rpc: string) {
  const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
  const { genesis } = await import("@metaplex-foundation/genesis");
  const { mplTokenMetadata } = await import("@metaplex-foundation/mpl-token-metadata");
  return createUmi(rpc).use(genesis()).use(mplTokenMetadata());
}
