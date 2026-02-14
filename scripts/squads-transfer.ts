import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const SQUADS_PROGRAM = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
const CLAWBOOK_MULTISIG = new PublicKey("FUtXoDxnQfwcPAAPYPPnj8rjRfF37kTXVLcV8Jdbin3X");

// Bot keypair (DZn3 — Salim listed as member of clawbook multisig)
const payerSecret = require("/Users/metasal/.config/solana/id.json");
const payer = Keypair.fromSecretKey(Uint8Array.from(payerSecret));

const connection = new Connection("https://viviyan-bkj12u-fast-mainnet.helius-rpc.com", "confirmed");

async function main() {
  // Get vault PDA (index 0)
  const [vaultPda] = multisig.getVaultPda({ multisigPda: CLAWBOOK_MULTISIG, index: 0, programId: SQUADS_PROGRAM });
  console.log("Vault PDA:", vaultPda.toBase58());
  
  const vaultBal = await connection.getBalance(vaultPda);
  console.log("Vault balance:", vaultBal / LAMPORTS_PER_SOL, "SOL");

  // Get current transaction index
  const msAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, CLAWBOOK_MULTISIG);
  const currentIndex = Number(msAccount.transactionIndex);
  const newIndex = BigInt(currentIndex + 1);
  console.log("Current tx index:", currentIndex, "-> new:", newIndex.toString());

  // Transfer 0.1 SOL from vault to payer
  const destination = new PublicKey("DZn31YBzwSuUYyieacJXQ4CLpZ63vSTnzwndoNqgNFb3");
  const transferIx = SystemProgram.transfer({
    fromPubkey: vaultPda,
    toPubkey: destination,
    lamports: 0.1 * LAMPORTS_PER_SOL,
  });

  // Create vault transaction
  const txMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [transferIx],
  });

  // 1. Create transaction
  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: CLAWBOOK_MULTISIG,
    transactionIndex: newIndex,
    creator: payer.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: txMessage,
    programId: SQUADS_PROGRAM,
  });

  // 2. Approve (proposal create + approve)
  const proposalCreateIx = multisig.instructions.proposalCreate({
    multisigPda: CLAWBOOK_MULTISIG,
    transactionIndex: newIndex,
    creator: payer.publicKey,
    programId: SQUADS_PROGRAM,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: CLAWBOOK_MULTISIG,
    transactionIndex: newIndex,
    member: payer.publicKey,
    programId: SQUADS_PROGRAM,
  });

  // Send create + propose + approve in one tx
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalCreateIx, approveIx],
  }).compileToV0Message();

  const { VersionedTransaction } = await import("@solana/web3.js");
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);

  const sig = await connection.sendTransaction(tx);
  console.log("Create+Propose+Approve TX:", sig);
  await connection.confirmTransaction(sig);

  // 3. Execute
  const executeIx = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda: CLAWBOOK_MULTISIG,
    transactionIndex: newIndex,
    member: payer.publicKey,
    programId: SQUADS_PROGRAM,
  });

  const { blockhash: bh2 } = await connection.getLatestBlockhash();
  const msg2 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: bh2,
    instructions: [executeIx.instruction],
  }).compileToV0Message(executeIx.lookupTableAccounts);

  const tx2 = new VersionedTransaction(msg2);
  tx2.sign([payer]);

  const sig2 = await connection.sendTransaction(tx2);
  console.log("Execute TX:", sig2);
  await connection.confirmTransaction(sig2);
  console.log("Done! 0.1 SOL transferred from vault to", destination.toBase58());
}

main().catch(console.error);
