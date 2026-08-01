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
import { mainnetRpcUrl } from "@/lib/rpc-server";

const FEE_PAYER_SECRET = process.env.SOL_FEE_PAYER_SECRET!;
const RPC = mainnetRpcUrl();

function feePayerKeypair(): Keypair {
  if (!FEE_PAYER_SECRET) throw new Error("SOL_FEE_PAYER_SECRET not configured");
  try {
    return Keypair.fromSecretKey(bs58.decode(FEE_PAYER_SECRET));
  } catch {
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

// Client fetches Jupiter's swap-instructions response directly (avoids
// Worker→Jupiter CF routing issues + saves a round-trip), then POSTs it here.
// We assemble it into a v0 tx with our fee payer and return the partial-signed
// bytes for the user to add their signature client-side.
export async function POST(req: NextRequest) {
  try {
    const { swapInstructionsResponse } = (await req.json()) as {
      swapInstructionsResponse: {
        computeBudgetInstructions?: JupInstruction[];
        setupInstructions?: JupInstruction[];
        swapInstruction: JupInstruction;
        cleanupInstruction?: JupInstruction;
        addressLookupTableAddresses?: string[];
      };
    };
    if (!swapInstructionsResponse?.swapInstruction) {
      return NextResponse.json({ error: "Missing swapInstructionsResponse.swapInstruction" }, { status: 400 });
    }

    const feePayer = feePayerKeypair();
    const conn = new Connection(RPC, "confirmed");
    const fpBal = await conn.getBalance(feePayer.publicKey, "confirmed");
    if (fpBal < 50_000) {
      return NextResponse.json(
        {
          error: "Fee payer empty — use Ultra path",
          feePayerEmpty: true,
          feePayer: feePayer.publicKey.toBase58(),
        },
        { status: 503 }
      );
    }

    const altPubkeys: PublicKey[] = (swapInstructionsResponse.addressLookupTableAddresses || []).map(
      (a) => new PublicKey(a),
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
      ...(swapInstructionsResponse.computeBudgetInstructions || []).map(toIx),
      ...(swapInstructionsResponse.setupInstructions || []).map(toIx),
      toIx(swapInstructionsResponse.swapInstruction),
      ...(swapInstructionsResponse.cleanupInstruction
        ? [toIx(swapInstructionsResponse.cleanupInstruction)]
        : []),
    ];

    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: feePayer.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message(altAccounts);

    const tx = new VersionedTransaction(msg);
    tx.sign([feePayer]);

    return NextResponse.json({
      ok: true,
      tx: Buffer.from(tx.serialize()).toString("base64"),
      feePayer: feePayer.publicKey.toBase58(),
    });
  } catch (e) {
    console.error("swap/build exception:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
