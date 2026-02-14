/**
 * Create a shared public Bubblegum tree for sol.new compressed NFTs.
 * Run: npx tsx scripts/create-tree.ts
 * 
 * This creates a depth-14 tree (~0.33 SOL) that supports 16,384 compressed NFTs.
 * The tree is public so any user can mint to it.
 * 
 * After running, add the tree address to .env.local:
 *   NEXT_PUBLIC_BUBBLEGUM_TREE=<address>
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createTree, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import {
  generateSigner,
  createSignerFromKeypair,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { Keypair } from "@solana/web3.js";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import * as fs from "fs";

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";

async function main() {
  // Load faucet keypair for tree creation (tree creator pays)
  const secret = process.env.FAUCET_PRIVATE_KEY;
  if (!secret) throw new Error("Set FAUCET_PRIVATE_KEY env var");
  
  let keypair: Keypair;
  if (secret.startsWith("[")) {
    keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  } else {
    const bs58 = require("bs58");
    keypair = Keypair.fromSecretKey(bs58.decode(secret));
  }

  console.log("Creator:", keypair.publicKey.toBase58());
  console.log("RPC:", RPC);

  const umi = createUmi(RPC).use(mplBubblegum());
  const umiKeypair = fromWeb3JsKeypair(keypair);
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));

  const merkleTree = generateSigner(umi);
  
  console.log("Creating tree:", merkleTree.publicKey.toString());
  console.log("Depth: 14, Buffer: 64, Canopy: 8");
  console.log("Capacity: 16,384 compressed NFTs");
  console.log("Cost: ~0.33 SOL");

  const result = await createTree(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
    canopyDepth: 8,
    public: true, // Anyone can mint
  });
  const signature = result?.signature ? Buffer.from(result.signature).toString("base64") : "unknown";

  console.log("\n✅ Tree created!");
  console.log("Address:", merkleTree.publicKey.toString());
  console.log("Signature:", signature);
  console.log("\nAdd to .env.local:");
  console.log(`NEXT_PUBLIC_BUBBLEGUM_TREE=${merkleTree.publicKey.toString()}`);
}

main().catch(console.error);
