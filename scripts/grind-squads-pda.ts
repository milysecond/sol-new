import { Keypair, PublicKey } from "@solana/web3.js";

const SQUADS_PROGRAM = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
const PREFIX = process.argv[2] || "NEW";

let attempts = 0;
const start = Date.now();

while (true) {
  const createKey = Keypair.generate();
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), Buffer.from("multisig"), createKey.publicKey.toBytes()],
    SQUADS_PROGRAM
  );

  attempts++;
  if (attempts % 100000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Searched ${attempts} keys in ${elapsed}s...`);
  }

  const pdaStr = pda.toBase58();
  if (pdaStr.toLowerCase().startsWith(PREFIX.toLowerCase())) {
    console.log(`\nFound after ${attempts} attempts!`);
    console.log(`createKey pubkey: ${createKey.publicKey.toBase58()}`);
    console.log(`createKey secret: [${Array.from(createKey.secretKey)}]`);
    console.log(`Multisig PDA: ${pda.toBase58()}`);
    
    // Save createKey
    const fs = require("fs");
    fs.writeFileSync(
      "/Users/metasal/.credentials/solnew-squads-createkey.json",
      JSON.stringify(Array.from(createKey.secretKey))
    );
    console.log("Saved createKey to ~/.credentials/solnew-squads-createkey.json");
    break;
  }
}
