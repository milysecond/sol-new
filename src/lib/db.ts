import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export async function initDb() {
  await db.batch([
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
  ]);
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
}) {
  const result = await db.execute({
    sql: `INSERT INTO tokens (wallet, name, symbol, supply, description, image_url, metadata_uri)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [data.wallet, data.name, data.symbol, data.supply || null, data.description || null, data.imageUrl || null, data.metadataUri || null],
  });
  return result.lastInsertRowid;
}

export async function saveNft(data: {
  wallet: string;
  name: string;
  description?: string;
  imageUrl?: string;
  metadataUri?: string;
}) {
  const result = await db.execute({
    sql: `INSERT INTO nfts (wallet, name, description, image_url, metadata_uri)
          VALUES (?, ?, ?, ?, ?)`,
    args: [data.wallet, data.name, data.description || null, data.imageUrl || null, data.metadataUri || null],
  });
  return result.lastInsertRowid;
}

export async function getWalletTokens(wallet: string) {
  return db.execute({ sql: "SELECT * FROM tokens WHERE wallet = ? ORDER BY created_at DESC", args: [wallet] });
}

export async function getWalletNfts(wallet: string) {
  return db.execute({ sql: "SELECT * FROM nfts WHERE wallet = ? ORDER BY created_at DESC", args: [wallet] });
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
