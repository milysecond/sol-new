import { createClient, type Client } from "@libsql/client";

// libsql's HTTP client builds requests with `cross-fetch` and calls them with a
// default `fetch`/`Request` from `@libsql/isomorphic-fetch`. Under OpenNext's
// Cloudflare bundle (Node resolution conditions) those resolve to node-fetch,
// which runs through workerd's buggy `node:http` shim and throws deep in
// processHeader ("Cannot read properties of null (reading 'has')"). We sidestep
// it by handing libsql an adapter that re-issues every request through workerd's
// native `fetch` (returning a native, WHATWG-compatible Response).
const edgeFetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
  if (typeof input === "string") return fetch(input, init);
  const req = input as {
    url: string;
    method?: string;
    headers: { forEach: (cb: (v: string, k: string) => void) => void };
    text: () => Promise<string>;
  };
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const method = req.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await req.text();
  return fetch(req.url, { method, headers, body });
};

// Lazy init — under OpenNext build, route modules are loaded for page-data
// collection without env vars, and createClient throws on undefined URL.
let _db: Client | null = null;
function getDb(): Client {
  if (_db) return _db;
  // Map Turso's `libsql://` scheme to `https://` so libsql uses the stateless
  // HTTP client (where our native-fetch adapter applies) rather than the
  // WebSocket transport, which relies on node:ws and also breaks on workerd.
  const url = (process.env.TURSO_URL || "").replace(/^libsql:\/\//, "https://");
  _db = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN!,
    fetch: edgeFetch,
  });
  return _db;
}
export const db = new Proxy({} as Client, {
  get(_target, prop) {
    const c = getDb() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    // @libsql/client methods read private fields off `this`; the proxy isn't a
    // real client instance, so unbound methods throw. Bind them to the client.
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
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
      network TEXT,
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
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT,
      auth TEXT,
      type TEXT NOT NULL DEFAULT 'web',
      topics TEXT NOT NULL DEFAULT 'tx,launch',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      uses_remaining INTEGER NOT NULL DEFAULT 1,
      uses_total INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS promo_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      wallet TEXT NOT NULL,
      kind TEXT NOT NULL,
      redeemed_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS claim_links (
      public_key TEXT PRIMARY KEY,
      sender TEXT,
      amount_lamports INTEGER,
      network TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      claimed_by TEXT,
      claimed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS poap_drops (
      code TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      location TEXT,
      issuer TEXT NOT NULL,
      max_claims INTEGER,
      claim_count INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      geo_lat REAL,
      geo_lng REAL,
      geo_radius_m INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS poap_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drop_code TEXT NOT NULL,
      wallet TEXT NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now')),
      claim_lat REAL,
      claim_lng REAL,
      claim_accuracy_m REAL,
      UNIQUE(drop_code, wallet),
      FOREIGN KEY (drop_code) REFERENCES poap_drops(code)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_poap_claims_wallet ON poap_claims(wallet)`,
    `CREATE INDEX IF NOT EXISTS idx_poap_drops_issuer ON poap_drops(issuer)`,
    `CREATE TABLE IF NOT EXISTS punt_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      fixture_id INTEGER NOT NULL,
      pick TEXT NOT NULL,
      pick_label TEXT,
      price INTEGER,
      home TEXT,
      away TEXT,
      start_time INTEGER,
      result TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      settled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(wallet, fixture_id)
    )`,
    `CREATE TABLE IF NOT EXISTS wallet_emails (
      email TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      credential_id TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      verified_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS vrf_draws (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      entries_json TEXT NOT NULL,
      entries_hash TEXT NOT NULL,
      entry_count INTEGER NOT NULL,
      winner_index INTEGER NOT NULL,
      winner TEXT NOT NULL,
      seed TEXT NOT NULL,
      verification_hash TEXT NOT NULL,
      provider TEXT NOT NULL,
      slot INTEGER,
      blockhash TEXT,
      proofnetwork_id INTEGER,
      title TEXT,
      wallet TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS short_links (
      code TEXT PRIMARY KEY,
      target_url TEXT NOT NULL,
      title TEXT,
      wallet TEXT,
      clicks INTEGER NOT NULL DEFAULT 0,
      payment_sig TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS bridge_customers (
      wallet TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      customer_id TEXT,
      kyc_link_id TEXT,
      kyc_status TEXT,
      tos_status TEXT,
      kyc_url TEXT,
      tos_url TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS bridge_transfers (
      transfer_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      amount TEXT,
      state TEXT,
      deposit_json TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ]);
  try {
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_short_links_wallet ON short_links(wallet, created_at DESC)"
    );
  } catch {
    /* ignore */
  }
  try {
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_bridge_customers_customer ON bridge_customers(customer_id)"
    );
  } catch {
    /* ignore */
  }
  try {
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_bridge_transfers_wallet ON bridge_transfers(wallet, created_at DESC)"
    );
  } catch {
    /* ignore */
  }
  try {
    await db.execute("ALTER TABLE short_links ADD COLUMN payment_sig TEXT");
  } catch {
    /* column already exists */
  }
  try {
    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_short_links_payment_sig ON short_links(payment_sig) WHERE payment_sig IS NOT NULL"
    );
  } catch {
    /* ignore */
  }
  try {
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_wallet_emails_wallet ON wallet_emails(wallet)"
    );
  } catch {
    /* ignore */
  }
  try {
    await db.execute("ALTER TABLE vrf_draws ADD COLUMN wallet TEXT");
  } catch {
    /* column already exists */
  }
  try {
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_vrf_draws_wallet ON vrf_draws(wallet, created_at DESC)"
    );
  } catch {
    /* ignore */
  }
  // Idempotent migration for the network column on existing deployments
  try {
    await db.execute("ALTER TABLE tokens ADD COLUMN network TEXT");
  } catch {
    // column already exists
  }
  try {
    await db.execute("ALTER TABLE multisigs ADD COLUMN network TEXT");
  } catch {
    // column already exists
  }
  try {
    await db.execute("ALTER TABLE push_subscriptions ADD COLUMN last_seen TEXT DEFAULT (datetime('now'))");
  } catch {
    // column already exists
  }
  try {
    await db.execute("ALTER TABLE claim_links ADD COLUMN token TEXT DEFAULT 'SOL'");
  } catch {
    // column already exists
  }
  // POAP geo-lock columns (existing drops)
  for (const sql of [
    "ALTER TABLE poap_drops ADD COLUMN geo_lat REAL",
    "ALTER TABLE poap_drops ADD COLUMN geo_lng REAL",
    "ALTER TABLE poap_drops ADD COLUMN geo_radius_m INTEGER",
    "ALTER TABLE poap_claims ADD COLUMN claim_lat REAL",
    "ALTER TABLE poap_claims ADD COLUMN claim_lng REAL",
    "ALTER TABLE poap_claims ADD COLUMN claim_accuracy_m REAL",
  ]) {
    try {
      await db.execute(sql);
    } catch {
      /* already exists */
    }
  }
  // Token rows pre-column are all from the mainnet-only era — safe to
  // backfill. Multisigs are NOT, because the create flow has been used on
  // both networks before the column shipped, so we leave nulls alone and
  // verify on display instead (see /wallet/multisig).
  await db.execute("UPDATE tokens SET network = 'mainnet' WHERE network IS NULL");

  // Launch platform tables (pump.fun launchpad)
  await db.batch([
    `CREATE TABLE IF NOT EXISTS creator_profiles (
      wallet TEXT PRIMARY KEY,
      bio TEXT,
      avatar_url TEXT,
      twitter TEXT,
      website TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS follows (
      follower TEXT NOT NULL,
      creator TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (follower, creator)
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      wallet TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      creator TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open',
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      choice TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(proposal_id, wallet)
    )`,
  ]);

  // Usernames (global, unique) — one per wallet
  try {
    await db.execute("ALTER TABLE creator_profiles ADD COLUMN username TEXT");
  } catch {
    /* already exists */
  }
  try {
    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_profiles_username ON creator_profiles(username) WHERE username IS NOT NULL"
    );
  } catch {
    /* ok */
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

export async function updateMetadata(id: string, json: string) {
  const r = await db.execute({
    sql: "UPDATE metadata SET json = ? WHERE id = ?",
    args: [json, id],
  });
  return r.rowsAffected > 0;
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
  network?: string;
}) {
  const result = await db.execute({
    sql: `INSERT INTO multisigs (wallet, name, multisig_pda, vault, threshold, member_count, network)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [data.wallet, data.name, data.multisigPda, data.vault, data.threshold, data.memberCount, data.network || null],
  });
  return result.lastInsertRowid;
}

export async function getWalletMultisigs(wallet: string) {
  return db.execute({ sql: "SELECT * FROM multisigs WHERE wallet = ? ORDER BY created_at DESC", args: [wallet] });
}

export async function saveWallet(publicKey: string, credentialId?: string): Promise<{ created: boolean }> {
  const r = await db.execute({
    sql: "INSERT OR IGNORE INTO wallets (public_key, credential_id) VALUES (?, ?)",
    args: [publicKey, credentialId || null],
  });
  if (credentialId) {
    // Backfill credential if we already knew this wallet
    await db.execute({
      sql: "UPDATE wallets SET credential_id = COALESCE(credential_id, ?) WHERE public_key = ?",
      args: [credentialId, publicKey],
    });
  }
  return { created: r.rowsAffected > 0 };
}

export async function getWalletByPublicKey(publicKey: string) {
  const r = await db.execute({
    sql: "SELECT public_key, credential_id, created_at FROM wallets WHERE public_key = ? LIMIT 1",
    args: [publicKey],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    publicKey: row.public_key as string,
    credentialId: (row.credential_id as string) || null,
    createdAt: (row.created_at as string) || null,
  };
}

/** Upsert email ↔ wallet link (verified only after passkey proof on /magic). */
export async function upsertWalletEmail(opts: {
  email: string;
  wallet: string;
  credentialId?: string | null;
  verified?: boolean;
}) {
  const email = opts.email.trim().toLowerCase();
  const verified = opts.verified ? 1 : 0;
  await db.execute({
    sql: `INSERT INTO wallet_emails (email, wallet, credential_id, verified, verified_at)
          VALUES (?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)
          ON CONFLICT(email) DO UPDATE SET
            wallet = excluded.wallet,
            credential_id = COALESCE(excluded.credential_id, wallet_emails.credential_id),
            verified = CASE WHEN excluded.verified = 1 THEN 1 ELSE wallet_emails.verified END,
            verified_at = CASE WHEN excluded.verified = 1 THEN datetime('now') ELSE wallet_emails.verified_at END`,
    args: [
      email,
      opts.wallet,
      opts.credentialId || null,
      verified,
      verified,
    ],
  });
}

export async function getWalletEmail(email: string) {
  const r = await db.execute({
    sql: "SELECT email, wallet, credential_id, verified, verified_at FROM wallet_emails WHERE email = ? LIMIT 1",
    args: [email.trim().toLowerCase()],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    email: row.email as string,
    wallet: row.wallet as string,
    credentialId: (row.credential_id as string) || null,
    verified: Boolean(row.verified),
    verifiedAt: (row.verified_at as string) || null,
  };
}

export async function getEmailsForWallet(wallet: string) {
  const r = await db.execute({
    sql: "SELECT email, wallet, credential_id, verified FROM wallet_emails WHERE wallet = ?",
    args: [wallet],
  });
  return r.rows.map((row) => ({
    email: row.email as string,
    wallet: row.wallet as string,
    credentialId: (row.credential_id as string) || null,
    verified: Boolean(row.verified),
  }));
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

export async function savePushSubscription(data: {
  endpoint: string;
  p256dh?: string | null;
  auth?: string | null;
  type?: string;
  wallet?: string | null;
  topics?: string;
}) {
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, type, wallet, topics)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            wallet = COALESCE(excluded.wallet, push_subscriptions.wallet),
            topics = excluded.topics`,
    args: [data.endpoint, data.p256dh || null, data.auth || null, data.type || "web", data.wallet || null, data.topics || "tx,launch"],
  });
}

export async function deletePushSubscription(endpoint: string) {
  await db.execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [endpoint] });
}

export async function getPushSubscriptionsByTopic(topic: string) {
  const r = await db.execute({
    sql: `SELECT * FROM push_subscriptions WHERE topics LIKE ?`,
    args: [`%${topic}%`],
  });
  return r.rows as unknown as Array<{ id: number; wallet: string | null; endpoint: string; p256dh: string | null; auth: string | null; type: string; topics: string }>;
}

export async function touchPushSubscription(endpoint: string) {
  await db.execute({
    sql: "UPDATE push_subscriptions SET last_seen = datetime('now') WHERE endpoint = ?",
    args: [endpoint],
  });
}

// Returns subs idle >= minHours but < maxHours (avoid spamming long-dead users)
export async function getInactivePushSubscriptions(minHours: number, maxHours: number) {
  const r = await db.execute({
    sql: `SELECT * FROM push_subscriptions
          WHERE last_seen IS NOT NULL
            AND last_seen <= datetime('now', '-' || ? || ' hours')
            AND last_seen >  datetime('now', '-' || ? || ' hours')`,
    args: [minHours, maxHours],
  });
  return r.rows as unknown as Array<{ id: number; wallet: string | null; endpoint: string; p256dh: string | null; auth: string | null; type: string; topics: string; last_seen: string }>;
}

// ─── Claim links (gifts) ─────────────────────────────────────────────────────
// Status bookkeeping only — the claim secret never touches the server; funds
// move on-chain regardless of what this table says.

export async function saveClaimLink(data: {
  publicKey: string;
  sender: string;
  amountLamports: number; // base units of the gifted token
  network: string;
  token?: string;
}) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO claim_links (public_key, sender, amount_lamports, network, token) VALUES (?, ?, ?, ?, ?)`,
    args: [data.publicKey, data.sender, data.amountLamports, data.network, data.token || "SOL"],
  });
}

export async function getClaimLink(publicKey: string) {
  const r = await db.execute({
    sql: "SELECT public_key, sender, amount_lamports, network, token, status, claimed_at, created_at FROM claim_links WHERE public_key = ? LIMIT 1",
    args: [publicKey],
  });
  return r.rows[0] ?? null;
}

export async function markClaimLinkClaimed(publicKey: string, claimedBy: string, status: "claimed" | "reclaimed") {
  const r = await db.execute({
    sql: `UPDATE claim_links SET status = ?, claimed_by = ?, claimed_at = datetime('now')
          WHERE public_key = ? AND status = 'pending'`,
    args: [status, claimedBy, publicKey],
  });
  return r.rowsAffected > 0;
}

// ─── Punt picks (free-to-play) ───────────────────────────────────────────────
// No stakes, no payouts — points only. Points = decimal odds ×10 at pick time.

export async function savePuntPick(data: {
  wallet: string;
  fixtureId: number;
  pick: string;
  pickLabel: string;
  price: number | null; // decimal odds ×1000
  home: string;
  away: string;
  startTime: number;
}) {
  await db.execute({
    sql: `INSERT INTO punt_picks (wallet, fixture_id, pick, pick_label, price, home, away, start_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(wallet, fixture_id) DO UPDATE SET
            pick = excluded.pick,
            pick_label = excluded.pick_label,
            price = excluded.price
          WHERE punt_picks.settled = 0`,
    args: [data.wallet, data.fixtureId, data.pick, data.pickLabel, data.price, data.home, data.away, data.startTime],
  });
}

export async function getWalletPuntPicks(wallet: string) {
  const r = await db.execute({
    sql: "SELECT * FROM punt_picks WHERE wallet = ? ORDER BY start_time DESC LIMIT 100",
    args: [wallet],
  });
  return r.rows;
}

export async function getUnsettledFixtures(startedBeforeMs: number): Promise<number[]> {
  const r = await db.execute({
    sql: "SELECT DISTINCT fixture_id FROM punt_picks WHERE settled = 0 AND start_time < ?",
    args: [startedBeforeMs],
  });
  return r.rows.map((row) => Number(row.fixture_id));
}

export async function settleFixturePicks(fixtureId: number, result: string) {
  await db.execute({
    sql: `UPDATE punt_picks
          SET settled = 1,
              result = ?,
              points = CASE WHEN pick = ? THEN COALESCE(ROUND(price / 100.0), 10) ELSE 0 END
          WHERE fixture_id = ? AND settled = 0`,
    args: [result, result, fixtureId],
  });
}

export async function getPuntLeaderboard(limit = 20) {
  const r = await db.execute({
    sql: `SELECT wallet,
                 SUM(points) AS points,
                 COUNT(*) AS picks,
                 SUM(CASE WHEN settled = 1 AND pick = result THEN 1 ELSE 0 END) AS wins,
                 SUM(settled) AS settled
          FROM punt_picks
          GROUP BY wallet
          ORDER BY points DESC, wins DESC, picks ASC
          LIMIT ?`,
    args: [limit],
  });
  return r.rows;
}

// ─── Promo codes ─────────────────────────────────────────────────────────────

export async function validatePromoCode(code: string): Promise<{ valid: boolean; usesRemaining: number; description: string | null }> {
  const r = await db.execute({
    sql: `SELECT uses_remaining, description FROM promo_codes
          WHERE code = ? AND uses_remaining > 0
            AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    args: [code.toUpperCase()],
  });
  if (!r.rows[0]) return { valid: false, usesRemaining: 0, description: null };
  return {
    valid: true,
    usesRemaining: r.rows[0].uses_remaining as number,
    description: r.rows[0].description as string | null,
  };
}

/**
 * Atomically consume `uses` from a promo code (default 1).
 * Returns false if the code is invalid, expired, or lacks enough remaining uses.
 */
export async function redeemPromoCode(
  code: string,
  wallet: string,
  kind: string,
  uses = 1,
): Promise<boolean> {
  const n = Math.max(1, Math.floor(uses));
  const updated = await db.execute({
    sql: `UPDATE promo_codes SET uses_remaining = uses_remaining - ?
          WHERE code = ? AND uses_remaining >= ?
            AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    args: [n, code.toUpperCase(), n],
  });
  if (!updated.rowsAffected) return false;
  await db.execute({
    sql: `INSERT INTO promo_redemptions (code, wallet, kind) VALUES (?, ?, ?)`,
    args: [code.toUpperCase(), wallet, `${kind}${n > 1 ? ` x${n}` : ""}`],
  });
  return true;
}

export async function createPromoCode(opts: { code?: string; uses?: number; description?: string; expiresAt?: string }): Promise<string> {
  const code = (opts.code ?? randomCode()).toUpperCase();
  await db.execute({
    sql: `INSERT INTO promo_codes (code, uses_remaining, uses_total, description, expires_at) VALUES (?, ?, ?, ?, ?)`,
    args: [code, opts.uses ?? 1, opts.uses ?? 1, opts.description ?? null, opts.expiresAt ?? null],
  });
  return code;
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── VRF / Fair draws ─────────────────────────────────────────────────────────

export async function saveVrfDraw(data: {
  id: string;
  mode: string;
  entries: string[];
  entriesHash: string;
  entryCount: number;
  winnerIndex: number;
  winner: string;
  seed: string;
  verificationHash: string;
  provider: string;
  slot?: number | null;
  blockhash?: string | null;
  proofnetworkId?: number | null;
  title?: string | null;
  wallet?: string | null;
}) {
  await db.execute({
    sql: `INSERT INTO vrf_draws (
      id, mode, entries_json, entries_hash, entry_count, winner_index, winner,
      seed, verification_hash, provider, slot, blockhash, proofnetwork_id, title, wallet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.id,
      data.mode,
      JSON.stringify(data.entries),
      data.entriesHash,
      data.entryCount,
      data.winnerIndex,
      data.winner,
      data.seed,
      data.verificationHash,
      data.provider,
      data.slot ?? null,
      data.blockhash ?? null,
      data.proofnetworkId ?? null,
      data.title ?? null,
      data.wallet ?? null,
    ],
  });
}

export async function getVrfDraw(id: string) {
  const r = await db.execute({
    sql: "SELECT * FROM vrf_draws WHERE id = ? LIMIT 1",
    args: [id],
  });
  return r.rows[0] ?? null;
}

export async function getVrfDrawsByWallet(wallet: string, limit = 50) {
  const r = await db.execute({
    sql: `SELECT id, mode, entry_count, winner_index, winner, title, created_at, entries_hash
          FROM vrf_draws
          WHERE wallet = ?
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [wallet, limit],
  });
  return r.rows;
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

// ─── Creator profiles ─────────────────────────────────────────────────────────

export async function upsertCreatorProfile(data: {
  wallet: string;
  bio?: string | null;
  avatarUrl?: string | null;
  twitter?: string | null;
  website?: string | null;
}) {
  await db.execute({
    sql: `INSERT INTO creator_profiles (wallet, bio, avatar_url, twitter, website)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(wallet) DO UPDATE SET
            bio = excluded.bio,
            avatar_url = excluded.avatar_url,
            twitter = excluded.twitter,
            website = excluded.website,
            updated_at = datetime('now')`,
    args: [data.wallet, data.bio ?? null, data.avatarUrl ?? null, data.twitter ?? null, data.website ?? null],
  });
}

/** Set or clear username for a wallet. Enforces uniqueness. */
export async function setWalletUsername(
  wallet: string,
  username: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Ensure profile row
  await db.execute({
    sql: `INSERT INTO creator_profiles (wallet) VALUES (?)
          ON CONFLICT(wallet) DO NOTHING`,
    args: [wallet],
  });

  if (username === null) {
    await db.execute({
      sql: `UPDATE creator_profiles SET username = NULL, updated_at = datetime('now') WHERE wallet = ?`,
      args: [wallet],
    });
    return { ok: true };
  }

  try {
    await db.execute({
      sql: `UPDATE creator_profiles SET username = ?, updated_at = datetime('now') WHERE wallet = ?`,
      args: [username, wallet],
    });
    return { ok: true };
  } catch (e) {
    const msg = String(e);
    if (msg.toLowerCase().includes("unique") || msg.includes("SQLITE_CONSTRAINT")) {
      return { ok: false, error: "That username is taken" };
    }
    return { ok: false, error: "Could not save username" };
  }
}

export async function getCreatorProfile(wallet: string) {
  const r = await db.execute({ sql: "SELECT * FROM creator_profiles WHERE wallet = ? LIMIT 1", args: [wallet] });
  return r.rows[0] ?? null;
}

export async function getCreatorByUsername(username: string) {
  const r = await db.execute({
    sql: "SELECT * FROM creator_profiles WHERE lower(username) = lower(?) LIMIT 1",
    args: [username],
  });
  return r.rows[0] ?? null;
}

export async function isUsernameTaken(username: string, exceptWallet?: string): Promise<boolean> {
  if (exceptWallet) {
    const r = await db.execute({
      sql: `SELECT wallet FROM creator_profiles
            WHERE lower(username) = lower(?) AND wallet != ?
            LIMIT 1`,
      args: [username, exceptWallet],
    });
    return r.rows.length > 0;
  }
  const r = await db.execute({
    sql: "SELECT 1 FROM creator_profiles WHERE lower(username) = lower(?) LIMIT 1",
    args: [username],
  });
  return r.rows.length > 0;
}

export async function followCreator(follower: string, creator: string) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO follows (follower, creator) VALUES (?, ?)",
    args: [follower, creator],
  });
}

export async function unfollowCreator(follower: string, creator: string) {
  await db.execute({ sql: "DELETE FROM follows WHERE follower = ? AND creator = ?", args: [follower, creator] });
}

export async function getFollowerCount(creator: string): Promise<number> {
  const r = await db.execute({ sql: "SELECT COUNT(*) as count FROM follows WHERE creator = ?", args: [creator] });
  return Number(r.rows[0].count);
}

export async function isFollowing(follower: string, creator: string): Promise<boolean> {
  const r = await db.execute({ sql: "SELECT 1 FROM follows WHERE follower = ? AND creator = ? LIMIT 1", args: [follower, creator] });
  return r.rows.length > 0;
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function saveComment(data: { id: string; mint: string; wallet: string; body: string }) {
  await db.execute({
    sql: "INSERT INTO comments (id, mint, wallet, body) VALUES (?, ?, ?, ?)",
    args: [data.id, data.mint, data.wallet, data.body],
  });
}

export async function getComments(mint: string, limit = 50, before?: string) {
  const args: (string | number)[] = [mint];
  let sql = "SELECT * FROM comments WHERE mint = ?";
  if (before) { sql += " AND created_at < ?"; args.push(before); }
  sql += " ORDER BY created_at DESC LIMIT ?";
  args.push(limit);
  const r = await db.execute({ sql, args });
  return r.rows;
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export async function saveProposal(data: {
  id: string; mint: string; creator: string; title: string; description?: string | null; expiresAt?: string | null;
}) {
  await db.execute({
    sql: "INSERT INTO proposals (id, mint, creator, title, description, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [data.id, data.mint, data.creator, data.title, data.description ?? null, data.expiresAt ?? null],
  });
}

export async function getProposals(mint: string) {
  const r = await db.execute({ sql: "SELECT * FROM proposals WHERE mint = ? ORDER BY created_at DESC", args: [mint] });
  return r.rows;
}

export async function saveVote(data: { id: string; proposalId: string; wallet: string; choice: string }) {
  await db.execute({
    sql: "INSERT OR REPLACE INTO votes (id, proposal_id, wallet, choice) VALUES (?, ?, ?, ?)",
    args: [data.id, data.proposalId, data.wallet, data.choice],
  });
}

export async function getVotes(proposalId: string) {
  const r = await db.execute({ sql: "SELECT * FROM votes WHERE proposal_id = ?", args: [proposalId] });
  return r.rows;
}

// ─── Bridge.xyz customers & transfers ────────────────────────────────────────

export type BridgeCustomerRow = {
  wallet: string;
  email: string;
  customerId: string | null;
  kycLinkId: string | null;
  kycStatus: string | null;
  tosStatus: string | null;
  kycUrl: string | null;
  tosUrl: string | null;
  updatedAt: string | null;
  createdAt: string | null;
};

export async function upsertBridgeCustomer(data: {
  wallet: string;
  email: string;
  customerId?: string | null;
  kycLinkId?: string | null;
  kycStatus?: string | null;
  tosStatus?: string | null;
  kycUrl?: string | null;
  tosUrl?: string | null;
}) {
  await db.execute({
    sql: `INSERT INTO bridge_customers (
            wallet, email, customer_id, kyc_link_id, kyc_status, tos_status, kyc_url, tos_url, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(wallet) DO UPDATE SET
            email = excluded.email,
            customer_id = COALESCE(excluded.customer_id, bridge_customers.customer_id),
            kyc_link_id = COALESCE(excluded.kyc_link_id, bridge_customers.kyc_link_id),
            kyc_status = COALESCE(excluded.kyc_status, bridge_customers.kyc_status),
            tos_status = COALESCE(excluded.tos_status, bridge_customers.tos_status),
            kyc_url = COALESCE(excluded.kyc_url, bridge_customers.kyc_url),
            tos_url = COALESCE(excluded.tos_url, bridge_customers.tos_url),
            updated_at = datetime('now')`,
    args: [
      data.wallet,
      data.email.trim().toLowerCase(),
      data.customerId ?? null,
      data.kycLinkId ?? null,
      data.kycStatus ?? null,
      data.tosStatus ?? null,
      data.kycUrl ?? null,
      data.tosUrl ?? null,
    ],
  });
}

export async function getBridgeCustomerByWallet(wallet: string): Promise<BridgeCustomerRow | null> {
  const r = await db.execute({
    sql: "SELECT * FROM bridge_customers WHERE wallet = ? LIMIT 1",
    args: [wallet],
  });
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    wallet: row.wallet as string,
    email: row.email as string,
    customerId: (row.customer_id as string) || null,
    kycLinkId: (row.kyc_link_id as string) || null,
    kycStatus: (row.kyc_status as string) || null,
    tosStatus: (row.tos_status as string) || null,
    kycUrl: (row.kyc_url as string) || null,
    tosUrl: (row.tos_url as string) || null,
    updatedAt: (row.updated_at as string) || null,
    createdAt: (row.created_at as string) || null,
  };
}

export async function saveBridgeTransfer(data: {
  transferId: string;
  wallet: string;
  customerId: string;
  amount: string | null;
  state: string;
  depositJson?: string | null;
}) {
  await db.execute({
    sql: `INSERT INTO bridge_transfers (transfer_id, wallet, customer_id, amount, state, deposit_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(transfer_id) DO UPDATE SET
            state = excluded.state,
            amount = COALESCE(excluded.amount, bridge_transfers.amount),
            deposit_json = COALESCE(excluded.deposit_json, bridge_transfers.deposit_json),
            updated_at = datetime('now')`,
    args: [
      data.transferId,
      data.wallet,
      data.customerId,
      data.amount,
      data.state,
      data.depositJson ?? null,
    ],
  });
}

export async function getBridgeTransfer(transferId: string) {
  const r = await db.execute({
    sql: "SELECT * FROM bridge_transfers WHERE transfer_id = ? LIMIT 1",
    args: [transferId],
  });
  return r.rows[0] ?? null;
}

export async function getWalletBridgeTransfers(wallet: string, limit = 20) {
  const r = await db.execute({
    sql: `SELECT * FROM bridge_transfers WHERE wallet = ?
          ORDER BY created_at DESC LIMIT ?`,
    args: [wallet, limit],
  });
  return r.rows;
}

// ─── Short links ─────────────────────────────────────────────────────────────

export type ShortLinkRow = {
  code: string;
  targetUrl: string;
  title: string | null;
  wallet: string | null;
  clicks: number;
  paymentSig: string | null;
  createdAt: string | null;
  expiresAt: string | null;
};

function mapShortLink(row: Record<string, unknown>): ShortLinkRow {
  return {
    code: row.code as string,
    targetUrl: row.target_url as string,
    title: (row.title as string) || null,
    wallet: (row.wallet as string) || null,
    clicks: Number(row.clicks ?? 0),
    paymentSig: (row.payment_sig as string) || null,
    createdAt: (row.created_at as string) || null,
    expiresAt: (row.expires_at as string) || null,
  };
}

export async function createShortLink(data: {
  code: string;
  targetUrl: string;
  title?: string | null;
  wallet?: string | null;
  expiresAt?: string | null;
  paymentSig?: string | null;
}): Promise<boolean> {
  try {
    await db.execute({
      sql: `INSERT INTO short_links (code, target_url, title, wallet, expires_at, payment_sig)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        data.code,
        data.targetUrl,
        data.title ?? null,
        data.wallet ?? null,
        data.expiresAt ?? null,
        data.paymentSig ?? null,
      ],
    });
    return true;
  } catch {
    // unique violation or other
    return false;
  }
}

export async function paymentSigUsed(sig: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM short_links WHERE payment_sig = ? LIMIT 1",
    args: [sig],
  });
  return r.rows.length > 0;
}

export async function deleteShortLink(code: string): Promise<boolean> {
  const r = await db.execute({
    sql: "DELETE FROM short_links WHERE code = ?",
    args: [code.toLowerCase()],
  });
  return r.rowsAffected > 0;
}

export async function listShortLinks(limit = 100): Promise<ShortLinkRow[]> {
  const r = await db.execute({
    sql: `SELECT * FROM short_links ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => mapShortLink(row as Record<string, unknown>));
}

export async function getShortLink(code: string): Promise<ShortLinkRow | null> {
  const r = await db.execute({
    sql: "SELECT * FROM short_links WHERE code = ? LIMIT 1",
    args: [code.toLowerCase()],
  });
  const row = r.rows[0] as Record<string, unknown> | undefined;
  return row ? mapShortLink(row) : null;
}

export async function incrementShortLinkClicks(code: string): Promise<void> {
  await db.execute({
    sql: "UPDATE short_links SET clicks = clicks + 1 WHERE code = ?",
    args: [code.toLowerCase()],
  });
}

export async function shortLinkCodeExists(code: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM short_links WHERE code = ? LIMIT 1",
    args: [code.toLowerCase()],
  });
  return r.rows.length > 0;
}

export async function getWalletShortLinks(wallet: string, limit = 50): Promise<ShortLinkRow[]> {
  const r = await db.execute({
    sql: `SELECT * FROM short_links WHERE wallet = ?
          ORDER BY created_at DESC LIMIT ?`,
    args: [wallet, limit],
  });
  return r.rows.map((row) => mapShortLink(row as Record<string, unknown>));
}
