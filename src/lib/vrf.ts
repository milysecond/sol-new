/**
 * Fair Draw helpers for sol.new/draw
 *
 * Entropy sources:
 *  - solana-blockhash (default, fully public + re-verifiable)
 *  - proofnetwork (when PROOFNETWORK_* env configured)
 *  - magicblock (on-chain path — program constants; consumer program TBD)
 */

export type VrfProvider = "solana-blockhash" | "proofnetwork" | "magicblock";

export type VrfDrawMode = "list" | "range" | "coin" | "dice";

export interface VrfDrawRecord {
  id: string;
  mode: VrfDrawMode;
  entries: string[];
  entriesHash: string;
  entryCount: number;
  winnerIndex: number;
  winner: string;
  seed: string;
  verificationHash: string;
  provider: VrfProvider;
  /** Solana slot used for entropy (blockhash mode) */
  slot: number | null;
  /** Solana blockhash used for entropy */
  blockhash: string | null;
  /** ProofNetwork request id if any */
  proofnetworkId: number | null;
  /** Optional host label */
  title: string | null;
  createdAt: string;
}

// ── MagicBlock Solana VRF (on-chain) ─────────────────────────────────────────
// https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/how-to-guide/quickstart

export const MAGICBLOCK = {
  vrfProgramId: "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz",
  vrfProgramIdentity: "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw",
  defaultQueue: "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh",
  ephemeralQueue: "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc",
  docs: "https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf",
  github: "https://github.com/magicblock-labs/solana-vrf",
} as const;

export const PROOFNETWORK = {
  site: "https://proofnetwork.lol",
  vrfExplorer: "https://proofnetwork.lol/vrfs",
  historyApi: "https://proofnetwork.lol/api/vrf/history",
  github: "https://github.com/proofnetworks",
} as const;

export function normalizeEntries(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw) {
    const t = line.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function parseEntryText(text: string): string[] {
  return normalizeEntries(
    text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Canonical hash of the entry list (order preserved as ticket order). */
export async function hashEntries(entries: string[]): Promise<string> {
  const canonical = entries.map((e) => e.trim()).join("\n");
  return sha256Hex(canonical);
}

export function indexFromSeed(seedHex: string, n: number): number {
  if (n <= 0) throw new Error("entry count must be > 0");
  const slice = seedHex.slice(0, 16);
  const value = BigInt("0x" + slice);
  return Number(value % BigInt(n));
}

export function makeDrawId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function presetsForMode(mode: VrfDrawMode): string[] | null {
  if (mode === "coin") return ["Heads", "Tails"];
  if (mode === "dice") return ["1", "2", "3", "4", "5", "6"];
  return null;
}
