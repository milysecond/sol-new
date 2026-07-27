// Map common Solana / passkey errors to plain-English messages a non-technical
// user can act on. Add a new entry whenever someone reports a confusing toast.

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!msg) return fallback;

  const m = msg.toLowerCase();

  // Passkey / WebAuthn cancellation
  if (m.includes("notallowederror") || m.includes("user cancelled") || m.includes("the operation either timed out") || m.includes("the user denied")) {
    return "Face ID was cancelled. Tap the button to try again.";
  }
  if (m.includes("not allowed") && m.includes("passkey")) {
    return "Your device blocked the passkey prompt. Check Face ID / Touch ID in Settings.";
  }
  if (m.includes("no credentials") || m.includes("no passkey")) {
    return "No passkey found on this device. Create a new wallet, or restore from another device.";
  }

  // Insufficient SOL (system program 0x1 / simulation logs)
  if (
    m.includes("insufficient lamports") ||
    m.includes("insufficient funds") ||
    m.includes("attempt to debit an account but found no record") ||
    (m.includes("0x1") && (m.includes("transfer") || m.includes("simulation") || m.includes("custom program error")))
  ) {
    if (m.includes("insufficient lamports") || m.includes("need ")) {
      return "Not enough SOL after the network fee. Tap Max to send what you can, or add a little more SOL.";
    }
    return "Not enough SOL in your wallet. Add some from the Get page.";
  }

  // Network / RPC
  if (m.includes("blockhash not found") || m.includes("transaction was not confirmed")) {
    return "The network is congested. Try again in a moment.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror")) {
    return "Lost your connection. Check your network and try again.";
  }
  if (m.includes("429") || m.includes("rate limit")) {
    return "Too many requests too fast — wait a few seconds and retry.";
  }

  // Versioned / legacy tx decode
  if (
    m.includes("versionedtransaction") ||
    m.includes("versioned transaction") ||
    m.includes("does not support versioned") ||
    m.includes("expected number") && m.includes("transaction") ||
    m.includes("unable to parse") && m.includes("transaction")
  ) {
    return "Couldn't read that transaction. Refresh and try again.";
  }

  // Slot / preflight
  if (m.includes("simulation failed") || m.includes("preflight")) {
    return "The transaction couldn't be built. Refresh the page and try again.";
  }

  // Promo
  if (m.includes("invalid or expired promo")) return "That promo code isn't valid or has been used up.";
  if (m.includes("promo funding failed")) return "We couldn't apply your promo right now. Try again or contact support.";

  // Passes through if it's already short and reads naturally (e.g. our own thrown messages)
  if (msg.length < 140 && /[a-z]/i.test(msg) && !m.includes("0x") && !m.includes("error:")) {
    return msg;
  }

  return fallback;
}
