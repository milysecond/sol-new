/**
 * Server-only helpers for the /api/ring proxies.
 *
 * The Helius named hosts are a Worker secret (HELIUS_SPR_RPC_URLS,
 * comma-separated). This module never logs them and never puts them in a
 * response. Pure functions so tests can run without a Worker.
 */
import { RING_SHIELDED_POOL_PROGRAM_ID, RING_USER_REGISTRY_PROGRAM_ID } from "./constants";

export const RING_ENDPOINTS_ENV = "HELIUS_SPR_RPC_URLS";

/** Privacy indexer methods the SDK calls (`POST {origin}/v1/spr/{method}`). */
export const SPR_METHODS = new Set([
  "getEncryptedUtxosByTags",
  "getShieldedTransactionsByTags",
  "getShieldedTransactionsBySignature",
  "getShieldedTransactionsByNullifiers",
  "getMerkleProofs",
  "getNonInclusionProofs",
  "getUserRecords",
]);

/** Solana JSON-RPC methods the Ring flows need. Everything else is refused. */
export const RPC_METHODS = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getBalance",
  "getLatestBlockhash",
  "getSlot",
  "getBlockHeight",
  "getSignatureStatuses",
  "getMinimumBalanceForRentExemption",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getFeeForMessage",
  "isBlockhashValid",
  "simulateTransaction",
  "sendTransaction",
]);

/** getProgramAccounts scans only the Ring programs (registry / asset registry). */
const SCANNABLE_PROGRAMS = new Set([RING_USER_REGISTRY_PROGRAM_ID, RING_SHIELDED_POOL_PROGRAM_ID]);

export const MAX_REQUEST_BYTES = 1024 * 1024;

export function parseEndpointPool(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const s = part.trim().replace(/\/+$/, "");
    if (!s) continue;
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || u.username || u.password || u.hash) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= 5) break;
  }
  return out;
}

export function ringEndpoints(env: Record<string, string | undefined> = process.env): string[] {
  return parseEndpointPool(env[RING_ENDPOINTS_ENV]);
}

/** `{origin}/v1/spr/{method}`, keeping any query (e.g. a legacy `?api-key=`). */
export function sprUpstreamUrl(endpoint: string, method: string): string {
  const u = new URL(endpoint);
  u.pathname = `/v1/spr/${method}`;
  return u.toString();
}

/** Same-origin browser calls only (plus local dev). A speed bump, not auth. */
export function isAllowedOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  let o: URL;
  let r: URL;
  try {
    o = new URL(origin);
    r = new URL(requestUrl);
  } catch {
    return false;
  }
  if (o.host === r.host) return true;
  const h = o.hostname;
  return h === "sol.new" || h.endsWith(".sol.new") || h === "localhost" || h === "127.0.0.1";
}

type JsonRpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

export type BodyCheck = { ok: true; method: string } | { ok: false; status: number; error: string };

function parseSingle(text: string): JsonRpcRequest | null {
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) return null;
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as JsonRpcRequest;
  } catch {
    return null;
  }
}

export function checkRpcBody(text: string): BodyCheck {
  const req = parseSingle(text);
  if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return { ok: false, status: 400, error: "Send one JSON-RPC 2.0 request." };
  }
  if (!RPC_METHODS.has(req.method)) {
    return { ok: false, status: 403, error: `RPC method not allowed: ${req.method.slice(0, 64)}` };
  }
  if (req.method === "getProgramAccounts") {
    const program = Array.isArray(req.params) ? req.params[0] : undefined;
    if (typeof program !== "string" || !SCANNABLE_PROGRAMS.has(program)) {
      return { ok: false, status: 403, error: "getProgramAccounts is limited to the Ring programs." };
    }
  }
  return { ok: true, method: req.method };
}

export function checkSprBody(text: string, pathMethod: string): BodyCheck {
  if (!SPR_METHODS.has(pathMethod)) {
    return { ok: false, status: 404, error: "Unknown privacy indexer method." };
  }
  const req = parseSingle(text);
  if (!req || req.jsonrpc !== "2.0" || req.method !== pathMethod) {
    return { ok: false, status: 400, error: "JSON-RPC method must match the path." };
  }
  return { ok: true, method: pathMethod };
}

/** Status codes worth trying the next endpoint for. */
export function shouldFailover(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500;
}

export type Forwarded = { status: number; body: ArrayBuffer | string; contentType: string; endpointIndex: number };

/**
 * POST `body` to each endpoint in order until one answers with a status that
 * is not a failover status. Errors never include an upstream URL.
 */
export async function forwardWithFailover(opts: {
  endpoints: string[];
  url: (endpoint: string) => string;
  body: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<Forwarded> {
  const f = opts.fetchImpl ?? fetch;
  let last: Forwarded = {
    status: 503,
    body: JSON.stringify({ error: "Ring endpoints are not configured." }),
    contentType: "application/json",
    endpointIndex: -1,
  };
  for (let i = 0; i < opts.endpoints.length; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 25_000);
    try {
      const r = await f(opts.url(opts.endpoints[i]!), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: opts.body,
        signal: ac.signal,
        // workerd does not implement redirect:"error" — it throws TypeError
        // immediately ("Invalid redirect value"), which we used to surface as
        // "endpoint did not answer". Use "manual": refuse to follow, and never
        // forward a Location host to the browser.
        redirect: "manual",
      });
      if (r.status >= 300 && r.status < 400) {
        last = {
          status: 502,
          body: JSON.stringify({ error: `Ring endpoint ${i + 1} redirected.` }),
          contentType: "application/json",
          endpointIndex: i,
        };
        continue;
      }
      const contentType = r.headers.get("content-type") || "application/json";
      const body = await r.arrayBuffer();
      last = { status: r.status, body, contentType, endpointIndex: i };
      if (!shouldFailover(r.status)) return last;
      // Do not pass an upstream error page (it can name the host) to the browser.
      last = {
        status: r.status === 404 ? 404 : 502,
        body: JSON.stringify({ error: `Ring endpoint ${i + 1} answered ${r.status}.` }),
        contentType: "application/json",
        endpointIndex: i,
      };
    } catch {
      last = {
        status: 502,
        body: JSON.stringify({ error: `Ring endpoint ${i + 1} did not answer.` }),
        contentType: "application/json",
        endpointIndex: i,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}
