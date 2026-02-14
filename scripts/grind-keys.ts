/**
 * Grind Solana keypairs with a "NEW" prefix and store them in the database.
 * Run: node --experimental-strip-types scripts/grind-keys.ts [count]
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const PREFIX = "NEW";
const TARGET = parseInt(process.argv[2] || "50", 10);

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

  const existing = await db.execute({
    sql: "SELECT COUNT(*) as count FROM ground_keys WHERE prefix = ? AND consumed = 0",
    args: [PREFIX],
  });
  const currentCount = existing.rows[0].count as number;
  console.log(`Current available "${PREFIX}" keys: ${currentCount}`);

  if (currentCount >= TARGET) {
    console.log(`Already have ${currentCount} keys, target is ${TARGET}. Done.`);
    process.exit(0);
  }

  const needed = TARGET - currentCount;
  console.log(`Grinding ${needed} keypairs with "${PREFIX}" prefix...`);

  let found = 0;
  let attempts = 0;
  const startTime = Date.now();

  while (found < needed) {
    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();
    attempts++;

    if (addr.startsWith(PREFIX)) {
      const secretKey = bs58.encode(kp.secretKey);
      await db.execute({
        sql: "INSERT OR IGNORE INTO ground_keys (public_key, secret_key, prefix) VALUES (?, ?, ?)",
        args: [addr, secretKey, PREFIX],
      });
      found++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = Math.round(attempts / (Date.now() - startTime) * 1000);
      console.log(`  [${found}/${needed}] ${addr} (${attempts} attempts, ${elapsed}s, ${rate}/s)`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Ground ${found} keys in ${totalTime}s (${attempts} total attempts)`);
}

main();
