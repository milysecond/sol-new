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
import { enforceSponsorLimits, simulateFeePayerLoss, SponsorRejected } from "@/lib/fee-payer";
import { clientIpFrom } from "@/lib/rate-limit";
import {
  JUPITER_V6_PROGRAM,
  SWAP_ALLOWED_PROGRAMS,
  SWAP_LIMITS,
  capComputeBudget,
  checkClientInstructions,
  feePayerOnlyPaysFees,
} from "@/lib/sponsor-policy";

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

const MAX_SETUP_IXS = 10;
const MAX_ALTS = 4;
/** Fees the fee payer may lose per sponsored swap: signatures + capped priority fee. */
const MAX_SWAP_SPEND_LAMPORTS = 100_000;

function isJupIx(v: unknown): v is JupInstruction {
  const i = v as JupInstruction;
  return (
    !!i &&
    typeof i.programId === "string" &&
    typeof i.data === "string" &&
    Array.isArray(i.accounts) &&
    i.accounts.length <= 64 &&
    i.accounts.every(
      (a) => a && typeof a.pubkey === "string" && typeof a.isSigner === "boolean" && typeof a.isWritable === "boolean",
    )
  );
}

// Client fetches Jupiter's swap-instructions response directly (avoids
// Worker→Jupiter CF routing issues + saves a round-trip), then POSTs it here.
// We assemble it into a v0 tx with our fee payer and return the partial-signed
// bytes for the user to add their signature client-side.
//
// Security (audit C2 follow-up): those instructions are client-controlled, so
// the fee payer may not appear in ANY of them, only Jupiter v6 / token / ATA /
// system / compute-budget programs are allowed, compute budget is replaced with
// capped values, a simulation must show the fee payer losing ≤ fees, and durable
// per-IP / per-wallet / global limits apply. Any rejection → the client falls
// back to Jupiter Ultra (user pays their own fee).
export async function POST(req: NextRequest) {
  try {
    const { swapInstructionsResponse } = (await req.json()) as {
      swapInstructionsResponse: {
        computeBudgetInstructions?: unknown[];
        setupInstructions?: unknown[];
        swapInstruction: unknown;
        cleanupInstruction?: unknown;
        addressLookupTableAddresses?: unknown[];
      };
    };
    const r = swapInstructionsResponse;
    if (!r || !isJupIx(r.swapInstruction)) {
      return NextResponse.json({ error: "Missing swapInstructionsResponse.swapInstruction" }, { status: 400 });
    }
    const compute = Array.isArray(r.computeBudgetInstructions) ? r.computeBudgetInstructions : [];
    const setup = Array.isArray(r.setupInstructions) ? r.setupInstructions : [];
    const altList = Array.isArray(r.addressLookupTableAddresses) ? r.addressLookupTableAddresses : [];
    if (compute.length > 4 || setup.length > MAX_SETUP_IXS || altList.length > MAX_ALTS) {
      return NextResponse.json({ error: "Swap too large to sponsor" }, { status: 400 });
    }
    if (![...compute, ...setup].every(isJupIx) || (r.cleanupInstruction != null && !isJupIx(r.cleanupInstruction))) {
      return NextResponse.json({ error: "Malformed instructions" }, { status: 400 });
    }
    if (!altList.every((a) => typeof a === "string")) {
      return NextResponse.json({ error: "Malformed lookup tables" }, { status: 400 });
    }
    const swapIx = toIx(r.swapInstruction);
    if (!swapIx.programId.equals(JUPITER_V6_PROGRAM)) {
      return NextResponse.json({ error: "Only Jupiter v6 swaps are sponsored" }, { status: 400 });
    }

    const feePayer = feePayerKeypair();
    const rawIxs = [
      ...(compute as JupInstruction[]).map(toIx),
      ...(setup as JupInstruction[]).map(toIx),
      swapIx,
      ...(r.cleanupInstruction ? [toIx(r.cleanupInstruction as JupInstruction)] : []),
    ];
    const { ixs } = capComputeBudget(rawIxs);
    const check = checkClientInstructions(ixs, feePayer.publicKey, SWAP_ALLOWED_PROGRAMS, SWAP_LIMITS.maxInstructions);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
    if (check.signers.length < 1 || check.signers.length > 2) {
      return NextResponse.json({ error: "Unexpected signers" }, { status: 400 });
    }

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

    await enforceSponsorLimits({
      scope: "swap",
      clientIp: clientIpFrom(req.headers),
      wallets: check.signers,
    });

    const altPubkeys: PublicKey[] = (altList as string[]).map((a) => new PublicKey(a));
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

    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: feePayer.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs.map((i) => ({ ...i, data: Buffer.from(i.data) })),
    }).compileToV0Message(altAccounts);

    const tx = new VersionedTransaction(msg);
    const final = feePayerOnlyPaysFees(tx, feePayer.publicKey);
    if (!final.ok) {
      return NextResponse.json({ error: final.reason }, { status: 400 });
    }
    const loss = await simulateFeePayerLoss(conn, tx, feePayer.publicKey);
    if (loss > MAX_SWAP_SPEND_LAMPORTS) {
      return NextResponse.json({ error: "Swap would cost the fee payer too much" }, { status: 400 });
    }
    tx.sign([feePayer]);

    return NextResponse.json({
      ok: true,
      tx: Buffer.from(tx.serialize()).toString("base64"),
      feePayer: feePayer.publicKey.toBase58(),
    });
  } catch (e) {
    if (e instanceof SponsorRejected) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("swap/build exception:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
