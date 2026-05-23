import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import bs58 from "bs58";

const FEE_PAYER_SECRET = process.env.SOL_FEE_PAYER_SECRET!;
const RPC = process.env.MAINNET_RPC || "https://api.mainnet-beta.solana.com";
const JUP_SWAP_INSTRUCTIONS = "https://quote-api.jup.ag/v6/swap-instructions";

function feePayerKeypair(): Keypair {
  if (!FEE_PAYER_SECRET) throw new Error("SOL_FEE_PAYER_SECRET not configured");
  // Accept base58 secret (88 chars) — what `solana-keygen` exports.
  try {
    return Keypair.fromSecretKey(bs58.decode(FEE_PAYER_SECRET));
  } catch {
    // Also accept JSON array (Phantom export format).
    const arr = JSON.parse(FEE_PAYER_SECRET);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
}

type JupInstruction = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

function toIx(i: JupInstruction) {
  return {
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(i.data, "base64"),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { userPublicKey, quoteResponse } = await req.json();
    if (!userPublicKey || !quoteResponse) {
      return NextResponse.json({ error: "Missing userPublicKey or quoteResponse" }, { status: 400 });
    }

    const feePayer = feePayerKeypair();

    // Ask Jupiter for the raw instructions (not a pre-built tx) so we can
    // build a v0 message with our fee payer instead of the user.
    const swapRes = await fetch(JUP_SWAP_INSTRUCTIONS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPublicKey,
        quoteResponse,
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        // We pay the gas; let Jupiter add a reasonable priority fee.
        prioritizationFeeLamports: "auto",
        dynamicComputeUnitLimit: true,
      }),
    });
    const swap = await swapRes.json();
    if (!swapRes.ok || swap.error) {
      console.error("Jupiter swap-instructions error:", swap);
      return NextResponse.json({ error: swap?.error || "swap-instructions failed" }, { status: 500 });
    }

    const conn = new Connection(RPC, "confirmed");

    // Resolve address-lookup-table accounts referenced by the route.
    const altPubkeys: PublicKey[] = (swap.addressLookupTableAddresses || []).map(
      (a: string) => new PublicKey(a),
    );
    const altAccounts: AddressLookupTableAccount[] = [];
    if (altPubkeys.length) {
      const infos = await conn.getMultipleAccountsInfo(altPubkeys, "confirmed");
      infos.forEach((info, idx) => {
        if (!info) return;
        altAccounts.push(
          new AddressLookupTableAccount({
            key: altPubkeys[idx],
            state: AddressLookupTableAccount.deserialize(info.data),
          }),
        );
      });
    }

    const ixs = [
      ...(swap.computeBudgetInstructions || []).map(toIx),
      ...(swap.setupInstructions || []).map(toIx),
      toIx(swap.swapInstruction),
      ...(swap.cleanupInstruction ? [toIx(swap.cleanupInstruction)] : []),
    ];

    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: feePayer.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message(altAccounts);

    const tx = new VersionedTransaction(msg);
    tx.sign([feePayer]); // fee payer signs; user adds their sig client-side

    const serialized = Buffer.from(tx.serialize()).toString("base64");
    return NextResponse.json({
      ok: true,
      tx: serialized,
      feePayer: feePayer.publicKey.toBase58(),
    });
  } catch (e) {
    console.error("swap/build exception:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
