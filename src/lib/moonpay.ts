/**
 * MoonPay fiat on-ramp (server helpers).
 * Supports Australia (AUD) + Apple Pay when enabled on the MoonPay account.
 *
 * Env:
 *   MOONPAY_PUBLISHABLE_KEY  — pk_live_… / pk_test_…
 *   MOONPAY_SECRET_KEY       — sk_live_… / sk_test_… (URL signing)
 */

import crypto from "crypto";

function envVar(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => { env?: Record<string, unknown> };
    };
    const ctx = getCloudflareContext();
    const v = ctx?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* not in CF request context */
  }
  return undefined;
}

export function moonpayConfigured(): boolean {
  return Boolean(envVar("MOONPAY_PUBLISHABLE_KEY") && envVar("MOONPAY_SECRET_KEY"));
}

export function moonpayIsTest(): boolean {
  const pk = envVar("MOONPAY_PUBLISHABLE_KEY") || "";
  return pk.startsWith("pk_test");
}

export type MoonpayAsset = "sol" | "usdc_sol";

export type BuildMoonpayUrlOpts = {
  wallet: string;
  /** sol or usdc on Solana */
  asset?: "SOL" | "USDC";
  /** Fiat amount */
  fiatAmount?: number;
  /** ISO fiat, default AUD */
  fiatCurrency?: string;
  redirectURL?: string;
  /** Optional email prefill */
  email?: string;
};

function buyHost(): string {
  return moonpayIsTest() ? "https://buy-sandbox.moonpay.com" : "https://buy.moonpay.com";
}

/** Map UI asset → MoonPay currency code */
function moonpayCurrency(asset: "SOL" | "USDC"): string {
  // MoonPay Solana USDC code
  return asset === "USDC" ? "usdc_sol" : "sol";
}

/**
 * Signed MoonPay buy URL locked to wallet + currency.
 * @see https://dev.moonpay.com/docs/ramps-sdk-build-url-signature
 */
export function buildMoonpayBuyUrl(opts: BuildMoonpayUrlOpts): {
  url: string;
  testMode: boolean;
} {
  const apiKey = envVar("MOONPAY_PUBLISHABLE_KEY");
  const secret = envVar("MOONPAY_SECRET_KEY");
  if (!apiKey || !secret) throw new Error("MoonPay not configured");

  const asset = opts.asset === "USDC" ? "USDC" : "SOL";
  const fiat = (opts.fiatCurrency || "AUD").toLowerCase();
  const params = new URLSearchParams();
  params.set("apiKey", apiKey);
  params.set("baseCurrencyCode", fiat);
  if (opts.fiatAmount != null && opts.fiatAmount > 0) {
    params.set("baseCurrencyAmount", String(Math.round(opts.fiatAmount)));
  }
  params.set("defaultCurrencyCode", moonpayCurrency(asset));
  params.set("currencyCode", moonpayCurrency(asset));
  params.set("walletAddress", opts.wallet);
  // Lock network wallet for solana currencies
  params.set(
    "walletAddresses",
    JSON.stringify({
      sol: opts.wallet,
      usdc_sol: opts.wallet,
    }),
  );
  params.set("showWalletAddressForm", "false");
  params.set("colorCode", "#7c3aed");
  // Apple Pay + cards + Google Pay (AU-supported methods depend on MoonPay account)
  params.set("enabledPaymentMethods", "apple_pay,credit_debit_card,google_pay,paypal,sepa_bank_transfer");
  if (opts.redirectURL) params.set("redirectURL", opts.redirectURL);
  if (opts.email) params.set("email", opts.email);
  // Language
  params.set("language", "en");

  const query = params.toString(); // already sorted? MoonPay wants original original query
  // Sign: HMAC-SHA256 of '?' + queryString with secret, then base64
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`?${query}`)
    .digest("base64");

  const url = `${buyHost()}?${query}&signature=${encodeURIComponent(signature)}`;
  return { url, testMode: moonpayIsTest() };
}
