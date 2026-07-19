/**
 * Signed magic links that bind an email to a passkey wallet.
 * Opening the link still requires passkey proof that the browser
 * can derive the same pubkey — email alone cannot unlock funds.
 */

import { SignJWT, jwtVerify } from "jose";
import { SITE_URL, sendEmail } from "./resend";

export type MagicLinkPurpose = "link" | "open";

export type MagicLinkClaims = {
  email: string;
  wallet: string;
  credentialId?: string;
  purpose: MagicLinkPurpose;
};

const ISSUER = "sol.new";
const AUDIENCE = "sol.new-magic";

function secretKey() {
  const raw =
    process.env.MAGIC_LINK_SECRET ||
    process.env.SOL_NEW_API_KEY ||
    process.env.RESEND_API_KEY;
  if (!raw) throw new Error("MAGIC_LINK_SECRET (or SOL_NEW_API_KEY) not set");
  return new TextEncoder().encode(raw);
}

export function magicLinkConfigured(): boolean {
  return Boolean(
    process.env.MAGIC_LINK_SECRET ||
      process.env.SOL_NEW_API_KEY ||
      process.env.RESEND_API_KEY
  );
}

export function isValidWalletPubkey(pk: string): boolean {
  // base58 Solana pubkey, 32–44 chars typical
  return /^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(pk);
}

export async function signMagicLink(
  claims: MagicLinkClaims,
  ttlSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const body: Record<string, string> = {
    email: claims.email.trim().toLowerCase(),
    wallet: claims.wallet,
    purpose: claims.purpose,
  };
  if (claims.credentialId) body.credentialId = claims.credentialId;

  return new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyMagicLink(
  token: string
): Promise<MagicLinkClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const email = typeof payload.email === "string" ? payload.email : null;
    const wallet = typeof payload.wallet === "string" ? payload.wallet : null;
    const purpose =
      payload.purpose === "link" || payload.purpose === "open"
        ? payload.purpose
        : null;
    if (!email || !wallet || !purpose || !isValidWalletPubkey(wallet)) {
      return null;
    }
    return {
      email: email.trim().toLowerCase(),
      wallet,
      purpose,
      credentialId:
        typeof payload.credentialId === "string"
          ? payload.credentialId
          : undefined,
    };
  } catch {
    return null;
  }
}

export function buildMagicUrl(token: string): string {
  return `${SITE_URL}/magic?t=${encodeURIComponent(token)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function magicEmailHtml(opts: {
  wallet: string;
  url: string;
  purpose: MagicLinkPurpose;
}): string {
  const short = shortWallet(opts.wallet);
  const title =
    opts.purpose === "open"
      ? "Open your sol.new wallet"
      : "Confirm your wallet link";
  const body =
    opts.purpose === "open"
      ? `Tap below to open wallet <strong style="color:#fff;font-family:ui-monospace,monospace;">${escapeHtml(short)}</strong> on this device. You’ll confirm with your passkey (Face ID / fingerprint).`
      : `Confirm that <strong style="color:#fff;font-family:ui-monospace,monospace;">${escapeHtml(short)}</strong> is your sol.new passkey wallet. You’ll unlock it with Face ID or fingerprint — we never receive your key.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#000;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#000;">
    <tr>
      <td align="center" style="padding:40px 16px;background:linear-gradient(180deg,#1a0b2e 0%,#000 55%);">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#0c0c12;border:1px solid rgba(168,85,247,0.25);border-radius:16px;">
          <tr>
            <td style="padding:36px 28px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;">
              <img src="https://sol.new/icon-192.png" width="64" height="64" alt="" style="border-radius:16px;margin-bottom:16px;" />
              <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:10px;">
                ${escapeHtml(title)}
              </div>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;">
                ${body}
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="border-radius:999px;background:linear-gradient(90deg,#a855f7,#fb923c);">
                    <a href="${escapeHtml(opts.url)}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">
                      Open with passkey
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:12px;color:#6b6b76;line-height:1.5;word-break:break-all;">
                Or paste: <a href="${escapeHtml(opts.url)}" style="color:#a855f7;">${escapeHtml(opts.url)}</a>
              </p>
              <p style="margin:0;font-size:12px;color:#6b6b76;line-height:1.6;">
                Link expires in 7 days. If you didn’t request this, ignore the email.
                · <a href="${SITE_URL}/unsubscribe" style="color:#8a8a96;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendMagicLinkEmail(opts: {
  email: string;
  wallet: string;
  credentialId?: string;
  purpose?: MagicLinkPurpose;
}): Promise<{ url: string }> {
  const purpose = opts.purpose || "link";
  const token = await signMagicLink(
    {
      email: opts.email,
      wallet: opts.wallet,
      credentialId: opts.credentialId,
      purpose,
    },
    60 * 60 * 24 * 7
  );
  const url = buildMagicUrl(token);
  const short = shortWallet(opts.wallet);

  await sendEmail({
    to: opts.email,
    subject:
      purpose === "open"
        ? `Open wallet ${short} on sol.new`
        : `Confirm wallet ${short} on sol.new`,
    html: magicEmailHtml({ wallet: opts.wallet, url, purpose }),
    text: `${purpose === "open" ? "Open" : "Confirm"} your sol.new passkey wallet ${short}:\n\n${url}\n\nYou’ll confirm with Face ID / fingerprint. Link expires in 7 days.\nUnsubscribe: ${SITE_URL}/unsubscribe`,
    listUnsubscribe: true,
    tags: [
      { name: "category", value: "magic-link" },
      { name: "purpose", value: purpose },
    ],
  });

  return { url };
}
