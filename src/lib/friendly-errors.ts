// Map common Solana / passkey errors to plain-English messages a non-technical
// user can act on. Add a new entry whenever someone reports a confusing toast.

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!msg) return fallback;

  const m = msg.toLowerCase();

  // Passkey / WebAuthn cancellation
  if (m.includes("gift was not sent")) {
    return "Passkey was cancelled. Gift was not sent — slide again and approve Face ID / fingerprint to continue.";
  }
  if (m.includes("notallowederror") || m.includes("user cancelled") || m.includes("the operation either timed out") || m.includes("the user denied") || m.includes("passkey authentication cancelled")) {
    return "Passkey was cancelled. Nothing was sent — try again and approve Face ID / fingerprint.";
  }
  if (m.includes("document is not focused") || m.includes("is not focused")) {
    return "Tap Slide to send again — Face ID needs the page focused.";
  }
  if (m.includes("not allowed") && (m.includes("passkey") || m.includes("credential") || m.includes("publickey"))) {
    return "Your device blocked the passkey prompt. Check Face ID / Touch ID in Settings, then try again.";
  }
  if (m.includes("no credentials") || m.includes("no passkey")) {
    return "No passkey found on this device. Create a new wallet, or restore from another device.";
  }

  if (m.includes("0xc") || m.includes("insufficientdelegation") || m.includes("insufficient delegation")) {
    return "Solana requires at least 1 SOL delegated. Add more SOL and try again.";
  }
  if (m.includes("no record of a prior credit") || m.includes("attempt to debit an account")) {
    return "A wallet in this transaction has 0 SOL (often the network-fee payer). Try again — fees may come from your balance.";
  }

  // Insufficient SOL (system program 0x1 / simulation logs / Phantom wording)
  if (
    m.includes("insufficient lamports") ||
    m.includes("insufficient funds") ||
    m.includes("not enough sol") ||
    m.includes("insufficient sol") ||
    (m.includes("0x1") && (m.includes("transfer") || m.includes("simulation") || m.includes("custom program error")))
  ) {
    return "Not enough SOL for this action (amount + network fee). Open Get funds, add SOL, then try again.";
  }
  if (m.includes("incorrect program id")) {
    return "This token uses Token-2022. Refresh and try again — we fixed the gift builder.";
  }
  if (m.includes("failed to sign transaction") || m.includes("signing_failed") || m.includes("signing failed")) {
    return "Wallet couldn't sign. Reconnect your wallet or use a passkey, then try again.";
  }
  if (m.includes("failed to send transaction") || m.includes("send_failed")) {
    return "Wallet signed but send failed. Check balance/fees and try again.";
  }
  if (m.includes("user rejected") || m.includes("rejected the request") || m.includes("user denied transaction")) {
    return "Transaction cancelled in the wallet app.";
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
    if (m.includes("no record of a prior credit") || m.includes("attempt to debit")) {
      return "Network fee wallet is empty — retry (app will charge fees from your wallet).";
    }
    if (m.includes("insufficient") || m.includes("0x1")) {
      return "Not enough SOL for fees. Keep a little spare and try again.";
    }
    // Prefer the original message if it already explains the failure
    if (msg.length < 200 && msg.toLowerCase().includes("stake")) return msg;
    if (m.includes("insufficient") || m.includes("lamports")) return "Not enough SOL for rent + fees. Lower amount or add SOL.";
    if (m.includes("already exists") || m.includes("already in use")) return "That stake account already exists. Tap Stake again.";
    return "The transaction failed simulation. Check balance/fees, refresh, and try again.";
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
