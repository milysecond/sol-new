// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createInitializeMintInstruction,
  getMintLen,
} from "@solana/spl-token";
import { createCreateMetadataAccountV3Instruction } from "@metaplex-foundation/mpl-token-metadata";

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

// Regular NFT mint
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
    // Create mint account
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: getMintLen(0),
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    // Initialize mint (0 decimals for NFT)
    createInitializeMintInstruction(mint.publicKey, 0, payer.publicKey, payer.publicKey),
    // Create ATA for owner
    createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint.publicKey),
    // Mint 1 token to owner
    createMintToInstruction(mint.publicKey, ata, payer.publicKey, 1),
    // Create metadata
    createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPda,
        mint: mint.publicKey,
        mintAuthority: payer.publicKey,
        payer: payer.publicKey,
        updateAuthority: payer.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name,
            symbol,
            uri,
            sellerFeeBasisPoints: 0,
            creators: [{ address: owner, verified: false, share: 100 }],
            collection: null,
            uses: null,
          },
          isMutable: true,
          collectionDetails: null,
        },
      }
    )
  );

  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(payer, mint);

  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig);

  return { mint: mint.publicKey.toBase58(), signature: sig };
}

// Compressed NFT via Helius
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
      const result = await mintCompressedNft(
        rpcUrl,
        owner,
        name,
        symbol || "NFT",
        uri,
        description || ""
      );
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
