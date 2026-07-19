// Smoke test for MoonPay sandbox keys in .dev.vars:
// checks the publishable key against the API, fetches a SOL buy quote,
// and generates a signed sandbox widget URL for manual browser testing.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const pk = vars.MOONPAY_PUBLISHABLE_KEY;
const sk = vars.MOONPAY_SECRET_KEY;
if (!pk || !sk) {
  console.error("MOONPAY_PUBLISHABLE_KEY / MOONPAY_SECRET_KEY missing from .dev.vars");
  process.exit(1);
}

const api = "https://api.moonpay.com";

const ipCheck = await fetch(`${api}/v3/ip_address?apiKey=${pk}`);
console.log("ip_address (pk validity):", ipCheck.status, ipCheck.ok ? await ipCheck.json() : await ipCheck.text());

const quote = await fetch(`${api}/v3/currencies/sol/buy_quote?apiKey=${pk}&baseCurrencyAmount=100&baseCurrencyCode=usd`);
const quoteBody = await quote.json();
console.log("sol buy_quote:", quote.status, quote.ok
  ? `$100 -> ${quoteBody.quoteCurrencyAmount} SOL (fees ${quoteBody.feeAmount})`
  : quoteBody);

const query = `?apiKey=${pk}&currencyCode=sol&baseCurrencyCode=usd&baseCurrencyAmount=100`;
const signature = createHmac("sha256", sk).update(query).digest("base64");
console.log("\nsigned sandbox widget URL:");
console.log(`https://buy-sandbox.moonpay.com${query}&signature=${encodeURIComponent(signature)}`);
