/** Solana Pay transfer-request helpers (no @solana/pay dependency). */

const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export type SolanaPayTransferOpts = {
  recipient: string;
  /** Human decimal amount, e.g. "0.01" */
  amount?: string;
  label?: string;
  message?: string;
  memo?: string;
  /** Base58 pubkey(s) included as readonly keys for payment discovery */
  reference?: string | string[];
  /** SPL mint; omit for native SOL */
  splToken?: string;
  network?: "mainnet-beta" | "mainnet" | "devnet" | string;
};

/** Build a `solana:` transfer request URL (Solana Pay spec). */
export function buildSolanaPayTransferUrl(opts: SolanaPayTransferOpts): string {
  const base = `solana:${opts.recipient}`;
  const params = new URLSearchParams();
  if (opts.amount) params.set("amount", opts.amount);
  if (opts.label) params.set("label", opts.label);
  if (opts.message) params.set("message", opts.message);
  if (opts.memo) params.set("memo", opts.memo);

  const refs = Array.isArray(opts.reference)
    ? opts.reference
    : opts.reference
      ? [opts.reference]
      : [];
  for (const r of refs) {
    if (r) params.append("reference", r);
  }

  if (opts.splToken) {
    params.set("spl-token", opts.splToken);
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function usdcMintForNetwork(network: string): string {
  return network === "devnet" ? USDC_DEVNET : USDC_MAINNET;
}

export function isUsdcMint(mint: string): boolean {
  return mint === USDC_MAINNET || mint === USDC_DEVNET;
}

export type ParsedSolanaPay = {
  /** Raw recipient address (base58) */
  recipient: string;
  amount?: string;
  label?: string;
  message?: string;
  memo?: string;
  references: string[];
  splToken?: string;
  /** native SOL vs SPL */
  kind: "sol" | "spl";
};

/**
 * Parse Solana Pay transfer URLs:
 * - solana:<recipient>?amount=…
 * - https://solana.com/… (not used)
 * - plain base58 pubkey (amount optional, no params)
 */
export function parseSolanaPayUrl(input: string): ParsedSolanaPay | null {
  const raw = input.trim();
  if (!raw) return null;

  // Plain base58 pubkey
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) && !raw.includes(":")) {
    return {
      recipient: raw,
      references: [],
      kind: "sol",
    };
  }

  let recipient = "";
  let search = "";

  if (raw.toLowerCase().startsWith("solana:")) {
    const rest = raw.slice("solana:".length);
    const q = rest.indexOf("?");
    if (q >= 0) {
      recipient = decodeURIComponent(rest.slice(0, q));
      search = rest.slice(q + 1);
    } else {
      recipient = decodeURIComponent(rest);
    }
  } else if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      // sol.new pay deep links? pay?to=… or path
      const to = u.searchParams.get("to") || u.searchParams.get("recipient");
      if (to) {
        recipient = to;
        search = u.searchParams.toString();
      } else {
        return null;
      }
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recipient)) return null;

  const params = new URLSearchParams(search);
  const amount = params.get("amount") || undefined;
  const label = params.get("label") || undefined;
  const message = params.get("message") || undefined;
  const memo = params.get("memo") || undefined;
  const splToken = params.get("spl-token") || undefined;
  const references = params.getAll("reference").filter(Boolean);

  return {
    recipient,
    amount: amount || undefined,
    label,
    message,
    memo,
    references,
    splToken: splToken || undefined,
    kind: splToken ? "spl" : "sol",
  };
}

/**
 * Find a confirmed signature that includes `reference` as an account key.
 * Used after a Solana Pay QR scan to discover the payer's transfer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findSignatureByReference(
  connection: { getSignaturesForAddress: (...args: any[]) => Promise<any[]> },
  reference: unknown,
  limit = 8,
): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(reference, { limit });
  for (const s of sigs) {
    if (!s?.err && s?.signature) return s.signature as string;
  }
  return null;
}
