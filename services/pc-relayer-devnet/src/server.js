/**
 * Minimal Privacy Cash-compatible relayer for Solana DEVNET.
 * Serves the API surface the privacycash SDK expects.
 *
 * Endpoints:
 *  GET  /config
 *  GET  /merkle/root?token=sol
 *  GET  /merkle/proofv2/?commitments=a,b
 *  GET  /utxos/range?start=&end=
 *  GET  /utxos/indices
 *  GET  /utxos/check/:enc
 *  POST /deposit   { signedTransaction, senderAddress }
 *  POST /withdraw  { serializedProof, ...accounts, encryptedOutputs, fee, ... }
 */
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import { WasmFactory } from "@lightprotocol/hasher.rs";
import BN from "bn.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });

const PROGRAM_ID = new PublicKey(
  process.env.PC_PROGRAM_ID || "ATZj4jZ4FFzkvAcvk27DW9GRkgSbFnHo49fKKPQXU7VS",
);
const RPC =
  process.env.PC_RPC ||
  "https://api.devnet.solana.com";
const PORT = Number(process.env.PORT || 8788);
const KEY_PATH =
  process.env.PC_RELAYER_KEY ||
  path.join(process.env.HOME, ".credentials/solnew-privacy-devnet.json");

const FEE_RECIPIENT = new PublicKey("97rSMQUukMDjA7PYErccyx7ZxbHvSDaeXp2ig5BwSrTf");
const MERKLE_HEIGHT = 26;

const [TREE] = PublicKey.findProgramAddressSync([Buffer.from("merkle_tree")], PROGRAM_ID);
const [TREE_TOKEN] = PublicKey.findProgramAddressSync([Buffer.from("tree_token")], PROGRAM_ID);
const [GLOBAL_CONFIG] = PublicKey.findProgramAddressSync([Buffer.from("global_config")], PROGRAM_ID);

const connection = new Connection(RPC, "confirmed");
const relayer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEY_PATH, "utf8"))),
);

const db = new Database(path.join(DATA, "index.db"));
db.exec(`
CREATE TABLE IF NOT EXISTS commitments (
  idx INTEGER PRIMARY KEY,
  commitment TEXT NOT NULL,
  encrypted_output TEXT NOT NULL,
  signature TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const insertCommit = db.prepare(
  `INSERT OR IGNORE INTO commitments (idx, commitment, encrypted_output, signature) VALUES (?, ?, ?, ?)`,
);
const getRange = db.prepare(
  `SELECT idx, commitment, encrypted_output FROM commitments WHERE idx >= ? AND idx < ? ORDER BY idx ASC`,
);
const getByEnc = db.prepare(`SELECT idx FROM commitments WHERE encrypted_output = ? LIMIT 1`);
const getAllCommits = db.prepare(`SELECT idx, commitment FROM commitments ORDER BY idx ASC`);
const countCommits = db.prepare(`SELECT COUNT(*) AS c FROM commitments`);
const maxIdx = db.prepare(`SELECT MAX(idx) AS m FROM commitments`);
const setMeta = db.prepare(
  `INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
);
const getMeta = db.prepare(`SELECT value FROM meta WHERE key = ?`);

// Anchor event disc = first 8 bytes of sha256("event:CommitmentData")
import { createHash } from "crypto";
const COMMIT_EVENT_DISC = createHash("sha256")
  .update("event:CommitmentData")
  .digest()
  .subarray(0, 8);

function parseCommitmentEvents(logs) {
  const out = [];
  for (const line of logs || []) {
    if (!line.startsWith("Program data: ")) continue;
    const b64 = line.slice("Program data: ".length).trim();
    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      continue;
    }
    if (buf.length < 8 + 8 + 32 + 4) continue;
    if (!buf.subarray(0, 8).equals(COMMIT_EVENT_DISC)) continue;
    let o = 8;
    const idx = Number(buf.readBigUInt64LE(o));
    o += 8;
    const commitment = buf.subarray(o, o + 32);
    o += 32;
    const len = buf.readUInt32LE(o);
    o += 4;
    if (o + len > buf.length) continue;
    const enc = buf.subarray(o, o + len);
    out.push({
      idx,
      commitment: commitment.toString("hex"),
      encrypted_output: enc.toString("hex"),
    });
  }
  return out;
}

async function fetchTreeState() {
  const info = await connection.getAccountInfo(TREE);
  if (!info) throw new Error("merkle_tree missing on devnet");
  const data = info.data;
  // zero_copy MerkleTreeAccount after 8-byte anchor disc
  // authority: 32 @8
  // next_index: u64 @40
  // subtrees: 26*32 @48
  // root: 32
  const nextIndex = Number(data.readBigUInt64LE(8 + 32));
  const subtreesStart = 8 + 32 + 8;
  const rootStart = subtreesStart + MERKLE_HEIGHT * 32;
  const root = data.subarray(rootStart, rootStart + 32);
  // big-endian? SDK uses decimal string of field element — little-endian BN
  const rootBn = new BN(root, "le");
  return { nextIndex, root: rootBn.toString(10), rootBytes: root };
}

let hasherPromise = null;
async function getHasher() {
  if (!hasherPromise) hasherPromise = WasmFactory.getInstance();
  return hasherPromise;
}

/** Rebuild sparse merkle path for a leaf index given all leaves 0..n-1 */
async function buildProofs(commitmentsHexByIndex, targets) {
  const lightWasm = await getHasher();
  // Use same MerkleTree class logic as SDK — simple poseidon binary tree
  // Import from a minimal implementation:
  const zero = [];
  zero[0] = lightWasm.poseidonHashString(["0"]);
  // actually SDK uses precomputed ZERO_BYTES — use light wasm zeros if available
  // Build leaves array sized to next power
  const maxI = Math.max(0, ...Object.keys(commitmentsHexByIndex).map(Number));
  const n = maxI + 1;
  const leaves = new Array(n).fill(null);
  for (const [i, c] of Object.entries(commitmentsHexByIndex)) {
    leaves[Number(i)] = c.startsWith("0x") ? c.slice(2) : c;
  }

  // Convert commitment hex (32 bytes le field) to decimal string for poseidon
  function toField(hex) {
    const b = Buffer.from(hex, "hex");
    return new BN(b, "le").toString(10);
  }

  // Build tree levels bottom-up
  let level = leaves.map((h, i) => (h ? toField(h) : null));
  const layers = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i];
      const r = level[i + 1] ?? l; // incomplete
      if (l == null && level[i + 1] == null) {
        next.push(null);
      } else if (l == null) {
        next.push(level[i + 1]);
      } else if (level[i + 1] == null) {
        next.push(l);
      } else {
        next.push(lightWasm.poseidonHashString([l, level[i + 1]]));
      }
    }
    layers.push(next);
    level = next;
  }

  const result = {};
  for (const cHex of targets) {
    const norm = cHex.startsWith("0x") ? cHex.slice(2) : cHex;
    let leafIndex = -1;
    for (const [i, h] of Object.entries(commitmentsHexByIndex)) {
      if (h.toLowerCase() === norm.toLowerCase()) {
        leafIndex = Number(i);
        break;
      }
    }
    if (leafIndex < 0) {
      result[norm] = { error: "commitment not found" };
      continue;
    }
    const pathElements = [];
    let idx = leafIndex;
    for (let d = 0; d < MERKLE_HEIGHT; d++) {
      const layer = layers[d] || [];
      const sibling = idx % 2 === 0 ? layer[idx + 1] : layer[idx - 1];
      pathElements.push(sibling ?? "0");
      idx = Math.floor(idx / 2);
    }
    result[norm] = {
      pathElements,
      pathIndices: leafIndex
        .toString(2)
        .padStart(MERKLE_HEIGHT, "0")
        .split("")
        .reverse()
        .map((b) => Number(b)),
      // SDK may expect different shape — also return index
      index: leafIndex,
    };
  }
  return result;
}

async function indexOnce({ full = false } = {}) {
  console.log("[index] scanning…");
  let beforeSig = undefined;
  let scanned = 0;
  let added = 0;
  let pages = 0;

  for (;;) {
    const opts = { limit: 100 };
    if (beforeSig) opts.before = beforeSig;
    let sigs;
    try {
      sigs = await connection.getSignaturesForAddress(TREE, opts);
    } catch (e) {
      console.warn("[index] sig page fail", e.message);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!sigs.length) break;
    pages++;
    for (const s of sigs) {
      scanned++;
      if (s.err) continue;
      try {
        const tx = await connection.getTransaction(s.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
        const logs = tx?.meta?.logMessages || [];
        const events = parseCommitmentEvents(logs);
        for (const e of events) {
          const r = insertCommit.run(e.idx, e.commitment, e.encrypted_output, s.signature);
          if (r.changes) added++;
        }
      } catch (e) {
        // rate limit — back off and retry once
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const tx = await connection.getTransaction(s.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });
          const logs = tx?.meta?.logMessages || [];
          for (const e of parseCommitmentEvents(logs)) {
            const r = insertCommit.run(e.idx, e.commitment, e.encrypted_output, s.signature);
            if (r.changes) added++;
          }
        } catch (e2) {
          console.warn("tx fail", s.signature.slice(0, 12), e2.message);
        }
      }
      // polite throttle on public RPC
      await new Promise((r) => setTimeout(r, 120));
    }
    beforeSig = sigs[sigs.length - 1].signature;
    if (sigs.length < 100) break;
    console.log(`[index] page ${pages} scanned=${scanned} added=${added}`);
  }

  setMeta.run("last_index_at", String(Date.now()));
  const c = countCommits.get().c;
  const m = maxIdx.get().m;
  console.log(`[index] done scanned=${scanned} added=${added} total=${c} maxIdx=${m}`);
  return { scanned, added, total: c, maxIdx: m };
}

// ── HTTP ──────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    program: PROGRAM_ID.toBase58(),
    tree: TREE.toBase58(),
    relayer: relayer.publicKey.toBase58(),
    commits: countCommits.get().c,
  });
});

app.get("/config", (_req, res) => {
  res.json({
    withdraw_fee_rate: 0.0025,
    withdraw_rent_fee: 0.006,
    deposit_fee_rate: 0,
    rent_fees: { sol: 0.006 },
    minimum_withdrawal: { sol: 0.01 },
    prices: { sol: 100 },
    usdc_withdraw_rent_fee: 0,
  });
});

app.get("/merkle/root", async (_req, res) => {
  try {
    const st = await fetchTreeState();
    res.json({ root: st.root, nextIndex: st.nextIndex });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/utxos/range", (req, res) => {
  const start = Number(req.query.start || 0);
  const end = Number(req.query.end || start + 1000);
  const rows = getRange.all(start, end);
  res.json({
    encrypted_outputs: rows.map((r) => r.encrypted_output),
    hasMore: rows.length > 0 && rows[rows.length - 1].idx + 1 < end && rows.length >= end - start - 1
      ? false
      : (maxIdx.get().m ?? -1) >= end,
    total: countCommits.get().c,
    start,
    end,
  });
});

app.get("/utxos/indices", (_req, res) => {
  const rows = getAllCommits.all();
  res.json({ indices: rows.map((r) => r.idx) });
});

app.get("/utxos/check/:enc", (req, res) => {
  const enc = req.params.enc;
  const row = getByEnc.get(enc);
  res.json({ exists: Boolean(row) });
});

app.get("/merkle/proofv2/", async (req, res) => {
  try {
    const raw = String(req.query.commitments || "");
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const rows = getAllCommits.all();
    const map = {};
    for (const r of rows) map[r.idx] = r.commitment;
    const proofs = await buildProofs(map, list);
    // Shape expected by SDK — return map or array; inspect mainnet quickly if needed
    res.json(proofs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/deposit", async (req, res) => {
  try {
    const { signedTransaction, senderAddress } = req.body || {};
    if (!signedTransaction) throw new Error("signedTransaction required");
    const raw = Buffer.from(signedTransaction, "base64");
    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
    });
    // confirm lightly
    await connection.confirmTransaction(sig, "confirmed").catch(() => {});
    // reindex this tx soon
    setTimeout(() => indexOnce().catch(() => {}), 2000);
    res.json({ success: true, signature: sig, senderAddress });
  } catch (e) {
    console.error("deposit", e);
    res.status(400).json({ success: false, error: e.message || String(e) });
  }
});

app.post("/withdraw", async (req, res) => {
  try {
    const p = req.body || {};
    const required = [
      "serializedProof",
      "treeAccount",
      "nullifier0PDA",
      "nullifier1PDA",
      "nullifier2PDA",
      "nullifier3PDA",
      "treeTokenAccount",
      "globalConfigAccount",
      "recipient",
      "feeRecipientAccount",
      "encryptedOutput1",
      "encryptedOutput2",
    ];
    for (const k of required) {
      if (p[k] == null) throw new Error(`missing ${k}`);
    }

    // Instruction data = serializedProof already includes proof+ext from client
    // But encrypted outputs are separate args in Anchor — client serializeProofAndExtData may pack differently.
    // Replicate SDK: single instruction with data = serializedProof + length-prefixed enc outputs?
    // Reading serializeProofAndExtData...
    const proofData = Buffer.from(p.serializedProof, "base64");
    const enc1 = Buffer.from(p.encryptedOutput1, "base64");
    const enc2 = Buffer.from(p.encryptedOutput2, "base64");

    // Anchor transact discriminator
    const TRANSACT_IX = Buffer.from([217, 149, 130, 143, 221, 52, 252, 119]);

    // If serializedProof already starts with disc, use as full data; else prepend
    let data = proofData;
    if (!proofData.subarray(0, 8).equals(TRANSACT_IX)) {
      // append encrypted outputs as borsh vecs
      const encPart = Buffer.concat([
        (() => {
          const l = Buffer.alloc(4);
          l.writeUInt32LE(enc1.length);
          return Buffer.concat([l, enc1]);
        })(),
        (() => {
          const l = Buffer.alloc(4);
          l.writeUInt32LE(enc2.length);
          return Buffer.concat([l, enc2]);
        })(),
      ]);
      data = Buffer.concat([TRANSACT_IX, proofData, encPart]);
    }

    const keys = [
      { pubkey: new PublicKey(p.treeAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(p.nullifier0PDA), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(p.nullifier1PDA), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(p.nullifier2PDA), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(p.nullifier3PDA), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(p.treeTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(p.globalConfigAccount), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(p.recipient), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(p.feeRecipientAccount), isSigner: false, isWritable: true },
      { pubkey: relayer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
    const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
    const { blockhash } = await connection.getLatestBlockhash();

    let lookupTableAccounts = [];
    if (p.lookupTableAddress) {
      try {
        const alt = await connection.getAddressLookupTable(new PublicKey(p.lookupTableAddress));
        if (alt.value) lookupTableAccounts = [alt.value];
      } catch {
        /* optional */
      }
    }

    const msg = new TransactionMessage({
      payerKey: relayer.publicKey,
      recentBlockhash: blockhash,
      instructions: [cu, ix],
    }).compileToV0Message(lookupTableAccounts);
    const tx = new VersionedTransaction(msg);
    tx.sign([relayer]);
    const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(sig, "confirmed").catch(() => {});
    setTimeout(() => indexOnce().catch(() => {}), 2000);
    res.json({ success: true, signature: sig });
  } catch (e) {
    console.error("withdraw", e);
    res.status(400).json({ success: false, error: e.message || String(e) });
  }
});

app.post("/admin/reindex", async (_req, res) => {
  try {
    const r = await indexOnce({ full: true });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// boot
const altPath = path.join(DATA, "alt.json");
export function getAltAddress() {
  try {
    return JSON.parse(fs.readFileSync(altPath, "utf8")).address;
  } catch {
    return process.env.PC_ALT || null;
  }
}

async function main() {
  console.log("relayer", relayer.publicKey.toBase58());
  console.log("program", PROGRAM_ID.toBase58());
  console.log("tree", TREE.toBase58());
  const bal = await connection.getBalance(relayer.publicKey);
  console.log("balance", bal / 1e9, "SOL");
  // initial index in background
  indexOnce().catch((e) => console.error("index", e));
  setInterval(() => indexOnce().catch(() => {}), 60_000);

  app.listen(PORT, () => console.log(`pc-relayer-devnet :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
