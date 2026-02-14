import { Keypair, PublicKey } from "@solana/web3.js";

const SQUADS_PROGRAM = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
const PREFIX = process.argv[2] || "new";
const SEED_PREFIX = Buffer.from("multisig");
const SEED_MULTISIG = Buffer.from("multisig");
const SEED_VAULT = Buffer.from("vault");

// vault index 0 as little-endian u8
const indexBuf = Buffer.alloc(1);
indexBuf.writeUInt8(0);

let attempts = 0;
const start = Date.now();

while (true) {
  const createKey = Keypair.generate();

  // Derive multisig PDA
  const [multisigPda] = PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_MULTISIG, createKey.publicKey.toBytes()],
    SQUADS_PROGRAM
  );

  // Derive vault PDA (index 0)
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [SEED_PREFIX, multisigPda.toBytes(), SEED_VAULT, indexBuf],
    SQUADS_PROGRAM
  );

  attempts++;
  if (attempts % 100000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Searched ${attempts} keys in ${elapsed}s...`);
  }

  const vaultStr = vaultPda.toBase58();
  if (vaultStr.toLowerCase().startsWith(PREFIX.toLowerCase())) {
    console.log(`\nFound after ${attempts} attempts!`);
    console.log(`createKey pubkey: ${createKey.publicKey.toBase58()}`);
    console.log(`createKey secret: [${Array.from(createKey.secretKey)}]`);
    console.log(`Multisig PDA: ${multisigPda.toBase58()}`);
    console.log(`Vault PDA: ${vaultPda.toBase58()}`);

    const fs = require("fs");
    fs.writeFileSync(
      "/Users/metasal/.credentials/solnew-squads-createkey-v2.json",
      JSON.stringify(Array.from(createKey.secretKey))
    );
    console.log("Saved createKey to ~/.credentials/solnew-squads-createkey-v2.json");
    break;
  }
}
