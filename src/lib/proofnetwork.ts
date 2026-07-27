/**
 * ProofNetwork client helpers (https://proofnetwork.lol)
 *
 * Public: VRF history feed.
 * Optional write path when PROOFNETWORK_API_URL + contract env are set.
 */

import { PROOFNETWORK } from "./vrf";

export interface ProofNetworkVrfRequest {
  id: number;
  type: string;
  data?: { start?: number; end?: number; [k: string]: unknown };
  result: number | string | null;
  timestamp: string;
  response_time?: number;
  seed?: string;
  nonce?: number;
  verification_hash?: string;
  contractAddress?: string;
  functionName?: string;
  metadata?: unknown;
}

export async function fetchProofNetworkHistory(limit = 20): Promise<ProofNetworkVrfRequest[]> {
  const url = `${PROOFNETWORK.historyApi}?limit=${limit}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ProofNetwork history HTTP ${res.status}`);
  const body = (await res.json()) as {
    success?: boolean;
    requests?: ProofNetworkVrfRequest[];
  };
  return body.requests ?? [];
}

/**
 * Attempt a contract call via ProofNetwork HTTP API.
 * Env: PROOFNETWORK_API_URL, PROOFNETWORK_FAIR_DRAW_CONTRACT, optional PROOFNETWORK_API_KEY.
 * Returns null if not configured or call fails.
 */
export async function tryProofNetworkRangeDraw(
  start: number,
  end: number,
): Promise<{
  result: number;
  seed: string;
  verificationHash: string;
  requestId: number | null;
  raw: unknown;
} | null> {
  const base = process.env.PROOFNETWORK_API_URL?.replace(/\/$/, "");
  const contractId = process.env.PROOFNETWORK_FAIR_DRAW_CONTRACT;
  const apiKey = process.env.PROOFNETWORK_API_KEY;
  if (!base || !contractId) return null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${base}/contracts/call`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contractId,
        functionName: process.env.PROOFNETWORK_FAIR_DRAW_FN || "drawRange",
        parameters: { start, end },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("json")) return null;
    const data = (await res.json()) as {
      success?: boolean;
      data?: {
        result?: number;
        seed?: string;
        verification_hash?: string;
        id?: number;
      };
      result?: number;
      seed?: string;
      verification_hash?: string;
      id?: number;
    };
    const payload = data.data ?? data;
    const result = Number(payload.result);
    if (!Number.isFinite(result)) return null;
    return {
      result,
      seed: String(payload.seed || ""),
      verificationHash: String(payload.verification_hash || ""),
      requestId: typeof payload.id === "number" ? payload.id : null,
      raw: data,
    };
  } catch {
    return null;
  }
}
