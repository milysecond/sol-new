// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMintLen,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY;
const MAINNET_RPC = "https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY;
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function getFaucetKeypair(): Keypair {
  const key = JSON.parse(process.env.FAUCET_PRIVATE_KEY || "[]");
  return Keypair.fromSecretKey(new Uint8Array(key));
}

function getRpc(network: string) {
  return network === "devnet" ? DEVNET_RPC : MAINNET_RPC;
}

function createMetadataInstruction(
  metadataPda: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  owner: PublicKey
): TransactionInstruction {
  // Manually serialize CreateMetadataAccountV3 instruction
  // Discriminator: 33
  const nameBytes = Buffer.from(name);
  const symbolBytes = Buffer.from(symbol);
  const uriBytes = Buffer.from(uri);

  const data = Buffer.alloc(1 + 4 + nameBytes.length + 4 + symbolBytes.length + 4 + uriBytes.length + 2 + 1 + 4 + 1 + 32 + 1 + 1 + 1 + 1 + 1 + 1);
  let offset = 0;

  // Discriminator: 33 (CreateMetadataAccountV3)
  data.writeUInt8(33, offset); offset += 1;

  // name (string: 4 byte len + bytes)
  data.writeUInt32LE(nameBytes.length, offset); offset += 4;
  nameBytes.copy(data, offset); offset += nameBytes.length;

  // symbol
  data.writeUInt32LE(symbolBytes.length, offset); offset += 4;
  symbolBytes.copy(data, offset); offset += symbolBytes.length;

  // uri
  data.writeUInt32LE(uriBytes.length, offset); offset += 4;
  uriBytes.copy(data, offset); offset += uriBytes.length;

  // seller_fee_basis_points
  data.writeUInt16LE(0, offset); offset += 2;

  // creators: Option<Vec<Creator>> - Some with 1 creator
  data.writeUInt8(1, offset); offset += 1; // Some
  data.writeUInt32LE(1, offset); offset += 4; // vec len
  // Creator { address, verified, share }
  owner.toBuffer().copy(data, offset); offset += 32;
  data.writeUInt8(0, offset); offset += 1; // verified = false
  data.writeUInt8(100, offset); offset += 1; // share = 100

  // collection: Option<Collection> = None
  data.writeUInt8(0, offset); offset += 1;

  // uses: Option<Uses> = None
  data.writeUInt8(0, offset); offset += 1;

  // is_mutable
  data.writeUInt8(1, offset); offset += 1;

  // collection_details: Option<CollectionDetails> = None
  data.writeUInt8(0, offset); offset += 1;

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data.subarray(0, offset),
  });
}

async function mintRegularNft(
  conn: Connection,
  payer: Keypair,
  owner: PublicKey,
  name: string,
  symbol: string,
  uri: string
) {
  const mint = Keypair.generate();
  const mintRent = await conn.getMinimumBalanceForRentExemption(getMintLen(0));
  const ata = await getAssociatedTokenAddress(mint.publicKey, owner);

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.publicKey.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: getMintLen(0),
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint.publicKey, 0, payer.publicKey, payer.publicKey),
    createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint.publicKey),
    createMintToInstruction(mint.publicKey, ata, payer.publicKey, 1),
    createMetadataInstruction(metadataPda, mint.publicKey, payer.publicKey, payer.publicKey, payer.publicKey, name, symbol, uri, owner)
  );

  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(payer, mint);

  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig);

  return { mint: mint.publicKey.toBase58(), signature: sig };
}

async function mintCompressedNft(
  rpcUrl: string,
  owner: string,
  name: string,
  symbol: string,
  uri: string,
  description: string
) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "sol-new",
      method: "mintCompressedNft",
      params: {
        name,
        symbol,
        owner,
        description,
        uri,
        sellerFeeBasisPoints: 0,
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return { assetId: data.result?.assetId, signature: data.result?.signature };
}

export async function POST(req: NextRequest) {
  try {
    const { owner, name, symbol, uri, description, network, compressed } = await req.json();

    if (!owner || !name || !uri)
      return NextResponse.json({ error: "Missing owner, name, or uri" }, { status: 400 });

    const rpcUrl = getRpc(network || "devnet");

    if (compressed) {
      const result = await mintCompressedNft(rpcUrl, owner, name, symbol || "NFT", uri, description || "");
      return NextResponse.json({ ok: true, type: "compressed", ...result });
    } else {
      const conn = new Connection(rpcUrl);
      const payer = getFaucetKeypair();
      const ownerPk = new PublicKey(owner);
      const result = await mintRegularNft(conn, payer, ownerPk, name, symbol || "NFT", uri);
      return NextResponse.json({ ok: true, type: "regular", ...result });
    }
  } catch (e) {
    console.error("Mint error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
