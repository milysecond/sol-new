/**
 * Web Share / social intent copy for sol.new.
 * Prefer concrete amounts + short context — never empty chrome.
 */

export type SharePayload = {
  title: string;
  text: string;
  url: string;
};

export function giftSharePayload(opts: {
  amount: string | number;
  /** SOL | USDC | WSOL | ticker */
  assetLabel: string;
  giftUrl: string;
  message?: string | null;
  senderLabel?: string | null;
}): SharePayload {
  const amount = String(opts.amount).trim();
  const asset = opts.assetLabel.trim() || "crypto";
  const isUsd = /usdc|usd/i.test(asset);
  const amountBit = isUsd ? `$${amount} ${asset}` : `${amount} ${asset}`;
  const from = opts.senderLabel?.trim();
  const note = opts.message?.trim();

  const title = `You received ${amountBit}`;
  const lines = [
    from ? `${from} sent you ${amountBit} on Solana.` : `You've been sent ${amountBit} on Solana.`,
    note ? `“${note.slice(0, 80)}”` : null,
    "Open the link and claim with Face ID / passkey — no app install.",
    opts.giftUrl,
  ].filter(Boolean) as string[];

  return {
    title,
    text: lines.join("\n"),
    url: opts.giftUrl,
  };
}

export function receiptSharePayload(opts: {
  amount: string;
  symbol: string;
  signature: string;
  direction?: "sent" | "received" | null;
  counterparty?: string | null;
  origin?: string;
}): SharePayload {
  const origin = opts.origin || (typeof window !== "undefined" ? window.location.origin : "https://sol.new");
  const url = `${origin}/receipt/${opts.signature}`;
  const amt = `${opts.amount} ${opts.symbol}`.trim();
  const who = opts.counterparty
    ? opts.counterparty.length > 12
      ? `${opts.counterparty.slice(0, 4)}…${opts.counterparty.slice(-4)}`
      : opts.counterparty
    : null;

  let line1 = `Solana payment: ${amt}`;
  if (opts.direction === "sent" && who) line1 = `Sent ${amt} to ${who}`;
  if (opts.direction === "received" && who) line1 = `Received ${amt} from ${who}`;

  return {
    title: `${amt} on Solana`,
    text: [
      line1,
      "Verified receipt on sol.new",
      url,
    ].join("\n"),
    url,
  };
}

export function tokenLaunchSharePayload(opts: {
  name: string;
  symbol: string;
  mint: string;
  origin?: string;
}): SharePayload {
  const origin = opts.origin || "https://sol.new";
  const url = `${origin}/token/${opts.mint}`;
  const ticker = opts.symbol?.startsWith("$") ? opts.symbol : `$${opts.symbol}`;
  return {
    title: `${opts.name} (${ticker}) on sol.new`,
    text: [
      `Just launched ${opts.name} (${ticker}) on Solana via sol.new.`,
      `Mint: ${opts.mint}`,
      "Passkey wallet · no seed phrase",
      url,
    ].join("\n"),
    url,
  };
}

/** Ask a friend to send SOL/USDC to this wallet */
export function requestFundsSharePayload(opts: {
  publicKey: string;
  origin?: string;
  /** Optional amount hint, e.g. "0.5 SOL" or "$20" */
  amountHint?: string | null;
}): SharePayload {
  const origin = opts.origin || (typeof window !== "undefined" ? window.location.origin : "https://sol.new");
  const pk = opts.publicKey.trim();
  const payUrl = `${origin}/address/${encodeURIComponent(pk)}`;
  const short = pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
  const amount = opts.amountHint?.trim();
  const title = amount ? `Send me ${amount} on Solana` : "Send me SOL on Solana";
  const text = [
    amount
      ? `Hey — can you send me ${amount} on Solana?`
      : "Hey — can you send me some SOL (or USDC) on Solana?",
    "",
    `My wallet: ${pk}`,
    "",
    `Open: ${payUrl}`,
    "",
    `(${short} on sol.new)`,
  ].join("\n");
  return { title, text, url: payUrl };
}

/** Share a resolved Solana name profile (/id/{name}) */
export function nameIdSharePayload(opts: {
  domain: string;
  owner: string;
  kindLabel?: string | null;
  origin?: string;
}): SharePayload {
  const origin =
    opts.origin ||
    (typeof window !== "undefined" ? window.location.origin : "https://sol.new");
  const domain = opts.domain.trim();
  const owner = opts.owner.trim();
  const short =
    owner.length > 12 ? `${owner.slice(0, 4)}…${owner.slice(-4)}` : owner;
  const url = `${origin}/id/${encodeURIComponent(domain)}`;
  const kind = opts.kindLabel?.trim();
  const title = `${domain} on sol.new`;
  const text = [
    `Solana name: ${domain}`,
    kind ? `Network: ${kind}` : null,
    `Owner: ${owner}`,
    `Portfolio: ${origin}/portfolio/${encodeURIComponent(domain)}`,
    "",
    url,
    `(${short})`,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text, url };
}

/** Deep-link builders for request-funds channels */
export function requestFundsChannelLinks(payload: SharePayload) {
  const full = payload.text.includes(payload.url)
    ? payload.text
    : `${payload.text}\n${payload.url}`;
  const enc = encodeURIComponent(full);
  const encUrl = encodeURIComponent(payload.url);
  const encTitle = encodeURIComponent(payload.title);

  return {
    /** iOS + Android sms body */
    sms: `sms:?&body=${enc}`,
    whatsapp: `https://wa.me/?text=${enc}`,
    telegram: `https://t.me/share/url?url=${encUrl}&text=${encTitle}%0A%0A${enc}`,
    /**
     * X has no public compose-DM-with-body without a recipient.
     * intent/post is reliable on mobile web + app. Avoid x.com/messages (Unable to load).
     */
    xPost: `https://x.com/intent/post?text=${enc}`,
    /** @deprecated alias of xPost */
    xMessages: `https://x.com/intent/post?text=${enc}`,
    nativeText: full,
  };
}

/** navigator.share with clipboard fallback */
export async function shareOrCopy(payload: SharePayload): Promise<"shared" | "copied"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return "shared";
    }
  } catch (e) {
    // user cancel → rethrow silence
    if (e instanceof Error && /abort|cancel/i.test(e.message)) throw e;
  }
  await navigator.clipboard.writeText(payload.text.includes(payload.url) ? payload.text : `${payload.text}\n${payload.url}`);
  return "copied";
}
