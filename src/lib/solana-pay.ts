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

/**
 * Find a confirmed signature that includes `reference` as an account key.
 * Used after a Solana Pay QR scan to discover the payer's transfer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findSignatureByReference(
  connection: { getSignaturesForAddress: (...args: any[]) => Promise<any[]> },
  reference: unknown,
  limit = 8
): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(reference, { limit });
  for (const s of sigs) {
    if (!s?.err && s?.signature) return s.signature as string;
  }
  return null;
}
