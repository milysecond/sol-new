/**
 * Create a devnet Address Lookup Table for Privacy Cash txs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Connection,
  Keypair,
  PublicKey,
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });

const PROGRAM_ID = new PublicKey("ATZj4jZ4FFzkvAcvk27DW9GRkgSbFnHo49fKKPQXU7VS");
const FEE_RECIPIENT = new PublicKey("97rSMQUukMDjA7PYErccyx7ZxbHvSDaeXp2ig5BwSrTf");
const RPC = process.env.PC_RPC || "https://api.devnet.solana.com";
const KEY_PATH =
  process.env.PC_RELAYER_KEY ||
  path.join(process.env.HOME, ".credentials/solnew-privacy-devnet.json");

const [TREE] = PublicKey.findProgramAddressSync([Buffer.from("merkle_tree")], PROGRAM_ID);
const [TREE_TOKEN] = PublicKey.findProgramAddressSync([Buffer.from("tree_token")], PROGRAM_ID);
const [GLOBAL_CONFIG] = PublicKey.findProgramAddressSync([Buffer.from("global_config")], PROGRAM_ID);

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEY_PATH, "utf8"))),
);
const connection = new Connection(RPC, "confirmed");

async function sendV0(ixs) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  const sig = await connection.sendTransaction(tx);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  return sig;
}

async function main() {
  console.log("payer", payer.publicKey.toBase58());
  console.log("balance", (await connection.getBalance(payer.publicKey)) / 1e9);

  const slot = await connection.getSlot();
  const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot - 1,
  });
  console.log("ALT", altAddress.toBase58());
  await sendV0([createIx]);
  console.log("created");

  await new Promise((r) => setTimeout(r, 2000));

  const addresses = [
    PROGRAM_ID,
    TREE,
    TREE_TOKEN,
    GLOBAL_CONFIG,
    FEE_RECIPIENT,
    payer.publicKey,
    SystemProgram.programId,
    ComputeBudgetProgram.programId,
  ];

  const extendIx = AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: altAddress,
    addresses,
  });
  await sendV0([extendIx]);
  console.log("extended with", addresses.length);

  const out = { address: altAddress.toBase58(), createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(DATA, "alt.json"), JSON.stringify(out, null, 2));
  console.log("wrote data/alt.json", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
