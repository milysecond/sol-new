import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export async function initDb() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS ground_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_key TEXT UNIQUE NOT NULL,
      secret_key TEXT NOT NULL,
      prefix TEXT NOT NULL,
      consumed INTEGER DEFAULT 0,
      consumed_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_key TEXT UNIQUE NOT NULL,
      credential_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      supply TEXT,
      description TEXT,
      image_url TEXT,
      metadata_uri TEXT,
      mint_address TEXT,
      network TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet) REFERENCES wallets(public_key)
    )`,
    `CREATE TABLE IF NOT EXISTS nfts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      metadata_uri TEXT,
      mint_address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet) REFERENCES wallets(public_key)
    )`,
    `CREATE TABLE IF NOT EXISTS multisigs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      name TEXT NOT NULL,
      multisig_pda TEXT NOT NULL,
      vault TEXT NOT NULL,
      threshold INTEGER NOT NULL,
      member_count INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet) REFERENCES wallets(public_key)
    )`,
    `CREATE TABLE IF NOT EXISTS metadata (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      wallet TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      content_type TEXT,
      size_bytes INTEGER,
      wallet TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ]);
  // Idempotent migration for the network column on existing deployments
  try {
    await db.execute("ALTER TABLE tokens ADD COLUMN network TEXT");
  } catch {
    // column already exists
  }
}

export async function saveMetadata(id: string, json: string, wallet?: string | null) {
  await db.execute({
    sql: "INSERT INTO metadata (id, json, wallet) VALUES (?, ?, ?)",
    args: [id, json, wallet || null],
  });
}

export async function getMetadata(id: string) {
  const r = await db.execute({
    sql: "SELECT json FROM metadata WHERE id = ? LIMIT 1",
    args: [id],
  });
  return (r.rows[0]?.json as string) || null;
}

export async function saveImageRef(id: string, url: string, contentType: string, sizeBytes: number, wallet?: string | null) {
  await db.execute({
    sql: "INSERT INTO images (id, url, content_type, size_bytes, wallet) VALUES (?, ?, ?, ?, ?)",
    args: [id, url, contentType, sizeBytes, wallet || null],
  });
}

export async function getImageRef(id: string) {
  const r = await db.execute({
    sql: "SELECT url, content_type FROM images WHERE id = ? LIMIT 1",
    args: [id],
  });
  if (!r.rows[0]) return null;
  return {
    url: r.rows[0].url as string,
    contentType: (r.rows[0].content_type as string) || "application/octet-stream",
  };
}

export async function saveMultisig(data: {
  wallet: string;
  name: string;
  multisigPda: string;
  vault: string;
  threshold: number;
  memberCount: number;
}) {
  const result = await db.execute({
    sql: `INSERT INTO multisigs (wallet, name, multisig_pda, vault, threshold, member_count)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [data.wallet, data.name, data.multisigPda, data.vault, data.threshold, data.memberCount],
  });
  return result.lastInsertRowid;
}

export async function getWalletMultisigs(wallet: string) {
  return db.execute({ sql: "SELECT * FROM multisigs WHERE wallet = ? ORDER BY created_at DESC", args: [wallet] });
}

export async function saveWallet(publicKey: string, credentialId?: string) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO wallets (public_key, credential_id) VALUES (?, ?)",
    args: [publicKey, credentialId || null],
  });
}

export async function saveToken(data: {
  wallet: string;
  name: string;
  symbol: string;
  supply?: string;
  description?: string;
  imageUrl?: string;
  metadataUri?: string;
  mintAddress?: string;
  network?: string;
}) {
  const result = await db.execute({
    sql: `INSERT INTO tokens (wallet, name, symbol, supply, description, image_url, metadata_uri, mint_address, network)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [data.wallet, data.name, data.symbol, data.supply || null, data.description || null, data.imageUrl || null, data.metadataUri || null, data.mintAddress || null, data.network || null],
  });
  return result.lastInsertRowid;
}

export async function saveNft(data: {
  wallet: string;
  name: string;
  description?: string;
  imageUrl?: string;
  metadataUri?: string;
  mintAddress?: string;
}) {
  const result = await db.execute({
    sql: `INSERT INTO nfts (wallet, name, description, image_url, metadata_uri, mint_address)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [data.wallet, data.name, data.description || null, data.imageUrl || null, data.metadataUri || null, data.mintAddress || null],
  });
  return result.lastInsertRowid;
}

export async function getWalletTokens(wallet: string) {
  return db.execute({ sql: "SELECT * FROM tokens WHERE wallet = ? ORDER BY created_at DESC", args: [wallet] });
}

export async function getWalletNfts(wallet: string) {
  return db.execute({ sql: "SELECT * FROM nfts WHERE wallet = ? ORDER BY created_at DESC", args: [wallet] });
}

export async function claimGroundKey(prefix: string) {
  // Atomically claim one unused key
  const row = await db.execute({
    sql: `UPDATE ground_keys SET consumed = 1, consumed_by = 'pending'
          WHERE id = (SELECT id FROM ground_keys WHERE prefix = ? AND consumed = 0 LIMIT 1)
          RETURNING public_key, secret_key`,
    args: [prefix],
  });
  if (!row.rows.length) return null;
  return {
    publicKey: row.rows[0].public_key as string,
    secretKey: row.rows[0].secret_key as string,
  };
}

export async function markGroundKeyUsed(publicKey: string, wallet: string) {
  await db.execute({
    sql: "UPDATE ground_keys SET consumed_by = ? WHERE public_key = ?",
    args: [wallet, publicKey],
  });
}

export async function countAvailableKeys(prefix: string) {
  const result = await db.execute({
    sql: "SELECT COUNT(*) as count FROM ground_keys WHERE prefix = ? AND consumed = 0",
    args: [prefix],
  });
  return result.rows[0].count as number;
}

export async function insertGroundKey(publicKey: string, secretKey: string, prefix: string) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO ground_keys (public_key, secret_key, prefix) VALUES (?, ?, ?)",
    args: [publicKey, secretKey, prefix],
  });
}

export async function getTokenByMint(mintAddress: string) {
  const result = await db.execute({
    sql: "SELECT * FROM tokens WHERE mint_address = ? LIMIT 1",
    args: [mintAddress],
  });
  return result.rows[0] || null;
}

export async function getRecentTokens(limit: number, offset: number, network?: string | null) {
  const where = ["mint_address IS NOT NULL"];
  const args: (string | number)[] = [];
  if (network === "mainnet" || network === "devnet") {
    where.push("network = ?");
    args.push(network);
  }
  args.push(limit, offset);
  const r = await db.execute({
    sql: `SELECT id, wallet, name, symbol, description, image_url, metadata_uri, mint_address, network, created_at
          FROM tokens
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`,
    args,
  });
  return r.rows;
}

export async function countTokens(network?: string | null) {
  const where = ["mint_address IS NOT NULL"];
  const args: string[] = [];
  if (network === "mainnet" || network === "devnet") {
    where.push("network = ?");
    args.push(network);
  }
  const r = await db.execute({
    sql: `SELECT COUNT(*) as count FROM tokens WHERE ${where.join(" AND ")}`,
    args,
  });
  return Number(r.rows[0].count);
}

export async function getStats() {
  const [wallets, tokens, nfts] = await Promise.all([
    db.execute("SELECT COUNT(*) as count FROM wallets"),
    db.execute("SELECT COUNT(*) as count FROM tokens"),
    db.execute("SELECT COUNT(*) as count FROM nfts"),
  ]);
  return {
    wallets: wallets.rows[0].count,
    tokens: tokens.rows[0].count,
    nfts: nfts.rows[0].count,
  };
}
