/**
 * Import ground keypair JSON files into the database.
 * Run: node --experimental-strip-types scripts/import-ground-keys.ts /tmp/ground-keys
 */
import { createClient } from "@libsql/client";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, readdirSync } from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const dir = process.argv[2] || "/tmp/ground-keys";
const PREFIX = "NEW";

async function main() {
  const db = createClient({
    url: process.env.TURSO_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  await db.execute(`CREATE TABLE IF NOT EXISTS ground_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT UNIQUE NOT NULL,
    secret_key TEXT NOT NULL,
    prefix TEXT NOT NULL,
    consumed INTEGER DEFAULT 0,
    consumed_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  const files = readdirSync(dir).filter(f => f.startsWith(PREFIX) && f.endsWith(".json"));
  console.log(`Found ${files.length} keypair files in ${dir}`);

  let imported = 0;
  for (const file of files) {
    const raw = JSON.parse(readFileSync(`${dir}/${file}`, "utf-8"));
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    const pubkey = kp.publicKey.toBase58();
    const secret = bs58.encode(kp.secretKey);

    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO ground_keys (public_key, secret_key, prefix) VALUES (?, ?, ?)",
        args: [pubkey, secret, PREFIX],
      });
      imported++;
      console.log(`  Imported: ${pubkey}`);
    } catch (e) {
      console.log(`  Skipped ${pubkey}: ${e}`);
    }
  }

  console.log(`\nImported ${imported}/${files.length} keys`);

  const count = await db.execute({
    sql: "SELECT COUNT(*) as count FROM ground_keys WHERE prefix = ? AND consumed = 0",
    args: [PREFIX],
  });
  console.log(`Total available "${PREFIX}" keys: ${count.rows[0].count}`);
}

main();
