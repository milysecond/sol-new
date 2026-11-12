/**
 * Honest Ring copy, shared by /ring, /ring/c, docs, and tests.
 * Default Ring = confidential, not anonymous.
 */

export const RING_BETA_NOTE =
  "Beta on Solana mainnet. Helius Privacy Rings 1.0 programs are still in formal verification through the end of 2026. Use amounts you can afford to lose.";

export const RING_PRIVACY_POINTS = [
  "Asset and amount are hidden on private transfers.",
  "Sender and recipient addresses stay public. This is confidential, not anonymous.",
  "Shielding from your public balance shows the amount. So does unshielding to a public balance.",
  "Sending to someone who isn't on the Ring is a public withdrawal, not a private transfer.",
] as const;

export const RING_KEYS_NOTE =
  "Your private keys come from the same Face ID passkey as your wallet, so there's nothing new to back up. Balances decrypt on this device. Proofs are made on this device.";

export type RingSendKind = "private-transfer" | "public-withdrawal";

/** Label a send by whether the recipient has a Ring registry record. */
export function ringSendKind(recipientRegistered: boolean): RingSendKind {
  return recipientRegistered ? "private-transfer" : "public-withdrawal";
}

export function ringSendLabel(kind: RingSendKind): string {
  return kind === "private-transfer" ? "Private transfer" : "Public withdrawal";
}

export type RingHistoryKind = "deposit" | "privateTransfer" | "ringEntry" | "publicWithdrawal" | "split" | "merge";

export function ringHistoryLabel(kind: RingHistoryKind, direction: "inbound" | "outbound" | "selfTransfer"): {
  title: string;
  visibility: "amount public" | "amount private";
} {
  switch (kind) {
    case "deposit":
      return { title: direction === "inbound" ? "Shielded" : "Shielded for someone", visibility: "amount public" };
    case "publicWithdrawal":
      return { title: "Public withdrawal", visibility: "amount public" };
    case "merge":
      return { title: "Merged notes", visibility: "amount private" };
    case "split":
      return { title: "Split notes", visibility: "amount private" };
    case "ringEntry":
      return { title: "Ring entry", visibility: "amount private" };
    case "privateTransfer":
    default:
      return {
        title: direction === "inbound" ? "Received privately" : direction === "outbound" ? "Sent privately" : "Moved privately",
        visibility: "amount private",
      };
  }
}
