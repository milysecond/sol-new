export type StoredRingLinkStatus = "funding" | "ready" | "claimed";

export type PayLinkFundingKind = "empty" | "fee-only" | "partial" | "funded";

export type PayLinkFundingView = {
  publicLamports: bigint;
  privateAmount: bigint;
  expectedAmount: bigint;
};

/**
 * How far a saved pay link got on-chain. "funded" means the private amount
 * arrived, even if the local record is still stuck on "funding" after a
 * confirmation timeout. "fee-only" means the 0.0025 public SOL got there but
 * the private transfer did not.
 */
export function classifyPayLinkFunding(view: PayLinkFundingView): PayLinkFundingKind {
  const expected = view.expectedAmount > BigInt(0) ? view.expectedAmount : BigInt(0);
  if (expected > BigInt(0) && view.privateAmount >= expected) return "funded";
  if (view.privateAmount > BigInt(0)) return expected > BigInt(0) ? "partial" : "funded";
  if (view.publicLamports > BigInt(0)) return "fee-only";
  return "empty";
}

export function payLinkStatusLabel(status: StoredRingLinkStatus, kind?: PayLinkFundingKind): string {
  if (status === "claimed") return "claimed";
  if (status === "ready" || kind === "funded") return "open the link to check";
  if (kind === "fee-only") return "fee sent · finish funding";
  if (kind === "partial") return "partially funded · finish funding";
  if (status === "funding") return "not fully funded";
  return "open the link to check";
}

export function expectedAmountOf(amount: string): bigint {
  try {
    const n = BigInt(amount);
    return n < BigInt(0) ? BigInt(0) : n;
  } catch {
    return BigInt(0);
  }
}
