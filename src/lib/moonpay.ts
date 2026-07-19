import crypto from "crypto";

const PK = process.env.MOONPAY_PUBLISHABLE_KEY ?? "";
const SK = process.env.MOONPAY_SECRET_KEY ?? "";
const WK = process.env.MOONPAY_WEBHOOK_KEY ?? "";

export const moonpayConfigured = () => Boolean(PK && SK);

// Test keys only work against the sandbox widget host.
const widgetHost = () =>
  PK.startsWith("pk_test") ? "https://buy-sandbox.moonpay.com" : "https://buy.moonpay.com";

// Signing is mandatory because we pass walletAddress. Per MoonPay docs the
// HMAC covers the query string including the leading "?", with values
// URL-encoded, and the base64 signature is appended URL-encoded.
export function signedWidgetUrl(params: Record<string, string>): string {
  const query = "?" + new URLSearchParams({ apiKey: PK, ...params }).toString();
  const signature = crypto.createHmac("sha256", SK).update(query).digest("base64");
  return `${widgetHost()}${query}&signature=${encodeURIComponent(signature)}`;
}

// Moonpay-Signature-V2 header: "t=<unix ts>,s=<hex hmac>", HMAC-SHA256 of
// `${t}.${rawBody}` keyed with the webhook key.
export function verifyWebhookSignature(header: string | null, rawBody: string): boolean {
  if (!header || !WK) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=") as [string, string])
  );
  const t = parts.t;
  const s = parts.s;
  if (!t || !s) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", WK).update(`${t}.${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(s, "hex"));
  } catch {
    return false;
  }
}
