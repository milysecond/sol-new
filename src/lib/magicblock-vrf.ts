/**
 * MagicBlock Solana VRF client for Fair Draw (Cloudflare Workers–safe).
 *
 * MagicBlock VRF is on-chain only (request CPI → oracle → callback CPI into our
 * fair-draw program). This module:
 *  1. Submits `request_draw` with SOL_FEE_PAYER_SECRET (JSON-RPC over fetch)
 *  2. Polls the Draw PDA until `fulfilled`
 *  3. Returns 32-byte randomness for winner selection
 *
 * Requires:
 *  - MAGICBLOCK_FAIR_DRAW_PROGRAM_ID (deployed programs/fair-draw)
 *  - SOL_FEE_PAYER_SECRET (or TREASURY_PRIVATE_KEY)
 *
 * Optional:
 *  - MAGICBLOCK_CLUSTER=devnet|mainnet (default mainnet)
 *
 * Docs: https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf
 */

import {
  Keypair,
  PublicKey,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { devnetRpcUrl, mainnetRpcUrl } from "@/lib/rpc-server";
import { MAGICBLOCK, sha256Hex } from "@/lib/vrf";

const DRAW_SEED = Buffer.from("fair-draw");
const IDENTITY_SEED = Buffer.from("identity");

function envVar(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => { env?: Record<string, unknown> };
    };
    const v = getCloudflareContext()?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

export function magicblockConfigured(): boolean {
  return Boolean(
    envVar("MAGICBLOCK_FAIR_DRAW_PROGRAM_ID") &&
      (envVar("SOL_FEE_PAYER_SECRET") || envVar("TREASURY_PRIVATE_KEY")),
  );
}

export function magicblockCluster(): "devnet" | "mainnet" {
  const c = (envVar("MAGICBLOCK_CLUSTER") || envVar("SOLANA_CLUSTER") || "mainnet").toLowerCase();
  return c === "devnet" ? "devnet" : "mainnet";
}

/** sha256("global:<name>")[0..8] Anchor discriminator */
async function anchorDisc(name: string): Promise<Buffer> {
  const hex = await sha256Hex(`global:${name}`);
  return Buffer.from(hex.slice(0, 16), "hex");
}

function feePayer(): Keypair {
  const raw = envVar("SOL_FEE_PAYER_SECRET") || envVar("TREASURY_PRIVATE_KEY");
  if (!raw) throw new Error("SOL_FEE_PAYER_SECRET not configured");
  try {
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
  } catch {
    /* fall through */
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bs58 = require("bs58") as { decode: (s: string) => Uint8Array };
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function programId(): PublicKey {
  const id = envVar("MAGICBLOCK_FAIR_DRAW_PROGRAM_ID");
  if (!id) throw new Error("MAGICBLOCK_FAIR_DRAW_PROGRAM_ID not configured");
  return new PublicKey(id);
}

export function drawPda(program: PublicKey, drawId16: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync([DRAW_SEED, Buffer.from(drawId16)], program)[0];
}

/** Consumer program identity PDA (seed "identity") — required by #[vrf] for CPI signing. */
export function programIdentityPda(program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([IDENTITY_SEED], program)[0];
}

/** Parse hex draw id (32 hex chars) → 16 bytes */
export function drawIdToBytes(drawIdHex: string): Uint8Array {
  const clean = drawIdHex.replace(/[^0-9a-f]/gi, "").slice(0, 32);
  const padded = clean.padEnd(32, "0");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function buildCallerSeed(
  drawId16: Uint8Array,
  entriesHash: string,
  entryCount: number,
): Promise<Uint8Array> {
  const hex = await sha256Hex(
    `magicblock|${Buffer.from(drawId16).toString("hex")}|${entriesHash}|${entryCount}`,
  );
  return Buffer.from(hex, "hex");
}

function rpcUrl(): string {
  return magicblockCluster() === "devnet" ? devnetRpcUrl() : mainnetRpcUrl();
}

/** Workers-safe JSON-RPC (no Node http agents / websockets). */
async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status} for ${method}`);
  }
  const body = (await res.json()) as {
    result?: T;
    error?: { message?: string; code?: number };
  };
  if (body.error) {
    throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
  }
  return body.result as T;
}

async function getLatestBlockhash(): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  const r = await rpcCall<{ value: { blockhash: string; lastValidBlockHeight: number } }>(
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
  );
  return r.value;
}

async function sendRawTransaction(base64: string): Promise<string> {
  return rpcCall<string>("sendTransaction", [
    base64,
    {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    },
  ]);
}

async function getSignatureStatus(
  signature: string,
): Promise<{ confirmationStatus?: string; err?: unknown } | null> {
  const r = await rpcCall<{ value: Array<{ confirmationStatus?: string; err?: unknown } | null> }>(
    "getSignatureStatuses",
    [[signature], { searchTransactionHistory: true }],
  );
  return r.value?.[0] ?? null;
}

async function getAccountDataBase64(pubkey: string): Promise<string | null> {
  const r = await rpcCall<{ value: { data: [string, string] } | null }>("getAccountInfo", [
    pubkey,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (!r.value?.data?.[0]) return null;
  return r.value.data[0];
}

async function confirmSignature(
  signature: string,
  lastValidBlockHeight: number,
  timeoutMs = 25_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = await getSignatureStatus(signature);
    if (st?.err) {
      throw new Error(`tx failed: ${JSON.stringify(st.err)}`);
    }
    if (
      st?.confirmationStatus === "confirmed" ||
      st?.confirmationStatus === "finalized"
    ) {
      return;
    }
    // stop early if chain moved past lastValidBlockHeight
    try {
      const h = await rpcCall<number>("getBlockHeight", [{ commitment: "confirmed" }]);
      if (typeof h === "number" && h > lastValidBlockHeight) {
        // still check status once more (may have landed)
        const st2 = await getSignatureStatus(signature);
        if (
          st2?.confirmationStatus === "confirmed" ||
          st2?.confirmationStatus === "finalized"
        ) {
          return;
        }
        throw new Error(`tx expired at block height ${h} (lastValid ${lastValidBlockHeight})`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("tx expired")) throw e;
      /* ignore height probe errors */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`confirm timeout for ${signature}`);
}

/**
 * Request MagicBlock VRF for this draw and wait for the oracle callback.
 * Returns hex seed (64 hex chars = 32 bytes randomness).
 */
export async function requestMagicblockRandomness(opts: {
  drawIdHex: string;
  entriesHash: string;
  entryCount: number;
  /** Poll timeout ms after confirm (default 35s) */
  timeoutMs?: number;
}): Promise<{
  seed: string;
  verificationHash: string;
  signature: string;
  drawAccount: string;
  randomness: Uint8Array;
} | null> {
  if (!magicblockConfigured()) return null;

  const program = programId();
  const payer = feePayer();
  const drawId16 = drawIdToBytes(opts.drawIdHex);
  const pda = drawPda(program, drawId16);
  const callerSeed = await buildCallerSeed(drawId16, opts.entriesHash, opts.entryCount);
  const disc = await anchorDisc("request_draw");

  // instruction data: disc(8) + draw_id(16) + caller_seed(32) + entry_count(u32 le)
  const data = Buffer.alloc(8 + 16 + 32 + 4);
  disc.copy(data, 0);
  Buffer.from(drawId16).copy(data, 8);
  Buffer.from(callerSeed).copy(data, 24);
  data.writeUInt32LE(opts.entryCount, 56);

  const oracleQueue = new PublicKey(MAGICBLOCK.defaultQueue);
  const programIdentity = programIdentityPda(program);
  const vrfProgram = new PublicKey(MAGICBLOCK.vrfProgramId);

  // Account order must match RequestDraw after #[vrf] expansion:
  // payer, draw, oracle_queue, system_program, program_identity, vrf_program, slot_hashes
  const ix = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: oracleQueue, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programIdentity, isSigner: false, isWritable: false },
      { pubkey: vrfProgram, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  let signature: string;
  try {
    const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();
    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(payer);
    const raw = tx.serialize();
    const b64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(raw).toString("base64")
        : btoa(String.fromCharCode(...raw));
    signature = await sendRawTransaction(b64);
    await confirmSignature(signature, lastValidBlockHeight, 25_000);
  } catch (e) {
    console.error("[magicblock-vrf] request_draw failed", e);
    return null;
  }

  // Poll Draw PDA: Anchor account = 8 disc + Draw fields
  const timeout = opts.timeoutMs ?? 35_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const b64 = await getAccountDataBase64(pda.toBase58());
      if (b64) {
        const bytes =
          typeof Buffer !== "undefined"
            ? Buffer.from(b64, "base64")
            : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        if (bytes.length >= 8 + 32 + 16 + 4 + 32 + 1) {
          const body = bytes.subarray(8); // skip discriminator
          // authority 32 | draw_id 16 | entry_count 4 | randomness 32 | fulfilled 1 | bump 1
          const randomness = body.subarray(32 + 16 + 4, 32 + 16 + 4 + 32);
          const fulfilled = body[32 + 16 + 4 + 32] === 1;
          if (fulfilled) {
            const seed = Buffer.from(randomness).toString("hex");
            const verificationHash = await sha256Hex(
              `magicblock-vrf|${signature}|${seed}|${opts.entriesHash}`,
            );
            return {
              seed,
              verificationHash,
              signature,
              drawAccount: pda.toBase58(),
              randomness: new Uint8Array(randomness),
            };
          }
        }
      }
    } catch (e) {
      console.error("[magicblock-vrf] poll error", e);
    }
    await new Promise((r) => setTimeout(r, 700));
  }

  console.error("[magicblock-vrf] timeout waiting for callback", { signature, pda: pda.toBase58() });
  return null;
}

/** Map 32-byte VRF output → index in [0, n). */
export function indexFromMagicblockRandomness(randomness: Uint8Array, n: number): number {
  if (n <= 0) throw new Error("n must be > 0");
  const hex = Buffer.from(randomness.subarray(0, 8)).toString("hex");
  const value = BigInt("0x" + hex);
  return Number(value % BigInt(n));
}
