#!/usr/bin/env node
// Generate a fresh Solana keypair to use as the SOL_FEE_PAYER for sponsored
// USDC→SOL swaps. Paste the printed secret into .env.local, then fund the
// printed address with a small amount of SOL (~0.03 SOL covers ~5000 swaps).
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const kp = Keypair.generate();
console.log("\nFee payer generated:");
console.log("  address:", kp.publicKey.toBase58());
console.log("  secret (base58, paste into SOL_FEE_PAYER_SECRET):");
console.log("  " + bs58.encode(kp.secretKey));
console.log("\nFund the address above with SOL on mainnet before enabling onramp.");
console.log("Recommended: 0.03 SOL (~$5) — covers thousands of swaps.\n");
