/**
 * Jupiter Studio token launch (server-only).
 * Docs: https://dev.jup.ag/docs/studio/create-token
 * Env: JUP_API_KEY | JUPITER_API_KEY
 */

const JUP_API = "https://api.jup.ag";
export const STUDIO_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function jupApiKey(): string | null {
  return process.env.JUP_API_KEY?.trim() || process.env.JUPITER_API_KEY?.trim() || null;
}

export function jupStudioConfigured(): boolean {
  return Boolean(jupApiKey());
}

export function jupStudioHeaders(json = false): HeadersInit {
  const key = jupApiKey();
  if (!key) throw new Error("JUP_API_KEY not configured");
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "sol.new/1.0 (+https://sol.new)",
    "x-api-key": key,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** Meme preset from Jupiter Studio docs (USDC curve, 16k → 69k). */
export function studioMemeCreateBody(opts: {
  creator: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImageContentType: string;
}) {
  return {
    buildCurveByMarketCapParam: {
      quoteMint: STUDIO_USDC,
      initialMarketCap: 16000,
      migrationMarketCap: 69000,
      tokenQuoteDecimal: 6,
      lockedVestingParam: {
        totalLockedVestingAmount: 0,
        cliffUnlockAmount: 0,
        numberOfVestingPeriod: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
      },
    },
    antiSniping: true,
    fee: { feeBps: 100 },
    isLpLocked: true,
    tokenName: opts.tokenName,
    tokenSymbol: opts.tokenSymbol,
    tokenImageContentType: opts.tokenImageContentType,
    creator: opts.creator,
  };
}

export type StudioCreateTx = {
  transaction?: string;
  mint?: string;
  imagePresignedUrl?: string;
  metadataPresignedUrl?: string;
  imageUrl?: string;
  error?: string;
  errorMessage?: string;
  [k: string]: unknown;
};

export async function studioCreateTx(body: unknown): Promise<StudioCreateTx> {
  const res = await fetch(`${JUP_API}/studio/v1/dbc-pool/create-tx`, {
    method: "POST",
    headers: jupStudioHeaders(true),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: StudioCreateTx = {};
  try {
    data = JSON.parse(text) as StudioCreateTx;
  } catch {
    throw new Error(text.slice(0, 200) || `Studio create-tx HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(String(data.errorMessage || data.error || `Studio create-tx HTTP ${res.status}`));
  }
  return data;
}

export async function studioSubmit(form: FormData): Promise<unknown> {
  const res = await fetch(`${JUP_API}/studio/v1/dbc-pool/submit`, {
    method: "POST",
    headers: jupStudioHeaders(false),
    body: form,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const err =
      typeof data === "object" && data && "error" in data
        ? String((data as { error?: string }).error)
        : text.slice(0, 200);
    throw new Error(err || `Studio submit HTTP ${res.status}`);
  }
  return data;
}
