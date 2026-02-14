import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const SQUADS_PROGRAM = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

const members = [
  { key: new PublicKey("MTSLZDJppGh6xUcnrSSbSQE5fgbvCtQ496MqgQTv8c1"), permissions: multisig.types.Permissions.all() },
  { key: new PublicKey("So1unLJ2pNLaT1vPjDvxppPWYALPfJWLkCYxHGoVYFR"), permissions: multisig.types.Permissions.all() },
];

const createKeySecret = require("/Users/metasal/.credentials/solnew-squads-createkey.json");
const createKey = Keypair.fromSecretKey(Uint8Array.from(createKeySecret));

// Use CLW bot wallet as fee payer
const payerSecret = require("/Users/metasal/.config/solana/id.json");
const payer = Keypair.fromSecretKey(Uint8Array.from(payerSecret));

const network = process.argv[2] || "devnet";
const rpc = network === "mainnet" 
  ? "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com"
  : "https://api.devnet.solana.com";

const treasury = network === "mainnet"
  ? new PublicKey("5DH2e3cJmFpyi6mk65EGFediunm4ui6BiKNUNrhWtD1b")
  : new PublicKey("HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK");

async function main() {
  const connection = new Connection(rpc, "confirmed");
  
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey, programId: SQUADS_PROGRAM });
  console.log(`Network: ${network}`);
  console.log(`Multisig PDA: ${multisigPda.toBase58()}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance: ${balance / 1e9} SOL`);
  
  if (balance < 0.05 * 1e9) {
    if (network === "devnet") {
      console.log("Requesting airdrop...");
      const sig = await connection.requestAirdrop(payer.publicKey, 1e9);
      await connection.confirmTransaction(sig);
      console.log("Airdropped 1 SOL");
    } else {
      console.error("Insufficient balance on mainnet. Fund the payer first.");
      process.exit(1);
    }
  }

  const ix = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: payer.publicKey,
    multisigPda,
    configAuthority: null,
    threshold: 1,
    members: members,
    timeLock: 0,
    treasury,
    rentCollector: null,
    programId: SQUADS_PROGRAM,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([payer, createKey]);

  const sig = await connection.sendTransaction(tx);
  console.log(`TX: ${sig}`);
  await connection.confirmTransaction(sig);
  console.log("Multisig created!");
  
  const [vault] = multisig.getVaultPda({ multisigPda, index: 0, programId: SQUADS_PROGRAM });
  console.log(`Vault: ${vault.toBase58()}`);
}

main().catch(console.error);
