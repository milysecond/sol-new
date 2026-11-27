#!/usr/bin/env node
/**
 * Security audit C1 — clean up stored WebAuthn credential IDs.
 *
 * For passkey wallets created without the PRF extension, the wallet seed is
 * SHA-256(credential rawId) (src/lib/passkey-wallet.ts fallback). Those credential
 * IDs were stored in Turso (wallets.credential_id, wallet_emails.credential_id),
 * so anyone with DB access could derive those wallets' private keys.
 *
 * This script:
 *   (b) lists the AFFECTED wallets: rows where
 *       Keypair.fromSeed(sha256(credential_id)).publicKey === stored wallet
 *   (a) with --apply, NULLs every stored credential_id (after writing the list).
 *
 * It never prints credential IDs or derived secrets — only public wallet addresses.
 *
 * Usage (read-only by default):
 *   TURSO_URL=… TURSO_AUTH_TOKEN=… node scripts/c1-credential-ids.mjs
 *   TURSO_URL=… TURSO_AUTH_TOKEN=… node scripts/c1-credential-ids.mjs --apply
 *   Options: --out <file>  (default: c1-affected-wallets-<timestamp>.json)
 *
 * The output file holds public addresses only (no secrets). Use it to warn those
 * users in-app to move funds to a new PRF wallet. Not run automatically.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { Keypair } from "@solana/web3.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const outIdx = args.indexOf("--out");
const OUT =
  outIdx >= 0 && args[outIdx + 1]
    ? args[outIdx + 1]
    : `c1-affected-wallets-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

const url = (process.env.TURSO_URL || "").replace(/^libsql:\/\//, "https://");
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Set TURSO_URL and TURSO_AUTH_TOKEN.");
  process.exit(1);
}
const db = createClient({ url, authToken });

/** Same decoding as passkey-wallet.ts credIdToBytes (base64 or base64url). */
function credIdToBytes(credentialId) {
  const b64 = credentialId.trim().replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(pad, "base64");
}

/** Same derivation as the non-PRF fallback: seed = SHA-256(rawId). */
function fallbackAddress(credentialId) {
  const raw = credIdToBytes(credentialId);
  if (!raw.length) return null;
  const seed = createHash("sha256").update(raw).digest();
  return Keypair.fromSeed(new Uint8Array(seed)).publicKey.toBase58();
}

async function scan(table, walletCol) {
  const r = await db.execute(
    `SELECT ${walletCol} AS wallet, credential_id FROM ${table} WHERE credential_id IS NOT NULL AND credential_id != ''`,
  );
  const affected = [];
  let checked = 0;
  for (const row of r.rows) {
    checked++;
    const wallet = String(row.wallet);
    let derived = null;
    try {
      derived = fallbackAddress(String(row.credential_id));
    } catch {
      derived = null;
    }
    if (derived && derived === wallet) affected.push(wallet);
  }
  return { checked, affected };
}

const wallets = await scan("wallets", "public_key");
const emails = await scan("wallet_emails", "wallet");
const affected = [...new Set([...wallets.affected, ...emails.affected])].sort();

const report = {
  generatedAt: new Date().toISOString(),
  note: "Passkey wallets whose seed is SHA-256(credential ID) (no PRF). Public addresses only.",
  checked: { wallets: wallets.checked, wallet_emails: emails.checked },
  affectedCount: affected.length,
  affected,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`Checked ${wallets.checked} wallets rows and ${emails.checked} wallet_emails rows with a stored credential ID.`);
console.log(`Affected (fallback-derived) wallets: ${affected.length}`);
for (const w of affected) console.log(`  ${w}`);
console.log(`Wrote ${OUT}`);

if (!APPLY) {
  console.log("Dry run — nothing changed. Re-run with --apply to NULL all stored credential IDs.");
  process.exit(0);
}

const res = await db.batch(
  [
    "UPDATE wallets SET credential_id = NULL WHERE credential_id IS NOT NULL",
    "UPDATE wallet_emails SET credential_id = NULL WHERE credential_id IS NOT NULL",
  ],
  "write",
);
console.log(`Nulled credential_id: wallets=${res[0].rowsAffected}, wallet_emails=${res[1].rowsAffected}`);
