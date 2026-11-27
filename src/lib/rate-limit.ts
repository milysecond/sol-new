/**
 * Durable fixed-window rate limits backed by Turso (the only shared store the
 * Worker has bound today — no KV / D1 / Durable Object / ratelimit binding).
 * In-memory Maps don't work on Workers: every isolate has its own copy.
 *
 * Keys are SHA-256 hashed so raw IPs never land in the DB.
 */
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export type RateRule = {
  /** Logical bucket, e.g. "sponsor:ip:1.2.3.4" */
  key: string;
  limit: number;
  windowSec: number;
};

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  tableReady ??= db
    .execute(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        bucket TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket, window_start)
      )`,
    )
    .then(() => undefined)
    .catch((e) => {
      tableReady = null;
      throw e;
    });
  return tableReady;
}

function bucketId(rule: RateRule): string {
  return createHash("sha256").update(`${rule.key}|${rule.windowSec}`).digest("hex").slice(0, 40);
}

/**
 * Count one hit against every rule. Returns the first rule that is over its
 * limit, or null when all pass. Throws if the DB is unreachable — callers that
 * guard money MUST treat that as "deny" (fail closed).
 */
export async function hitRateLimits(rules: RateRule[], nowMs = Date.now()): Promise<RateRule | null> {
  if (!rules.length) return null;
  await ensureTable();
  const stmts = rules.map((r) => {
    const windowStart = Math.floor(nowMs / 1000 / r.windowSec) * r.windowSec;
    return {
      sql: `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
            ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1
            RETURNING count`,
      args: [bucketId(r), windowStart],
    };
  });
  const results = await db.batch(stmts, "write");
  let over: RateRule | null = null;
  results.forEach((res, i) => {
    const count = Number(res.rows[0]?.count ?? 0);
    if (!over && count > rules[i]!.limit) over = rules[i]!;
  });
  // Opportunistic cleanup of stale windows (~1% of calls).
  if (Math.random() < 0.01) {
    const cutoff = Math.floor(nowMs / 1000) - 3 * 86_400;
    void db
      .execute({ sql: "DELETE FROM rate_limits WHERE window_start < ?", args: [cutoff] })
      .catch(() => {});
  }
  return over;
}

/**
 * Client IP for rate limiting. Only trusts `cf-connecting-ip`, which Cloudflare
 * sets (and overwrites) on every request to the Worker. `x-forwarded-for` and
 * `x-real-ip` are client-controlled and must not be used for limits.
 */
export function clientIpFrom(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim() || "no-cf-ip";
}
