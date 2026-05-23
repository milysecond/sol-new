// Helper to call App Store Connect API with the on-disk key.
// Usage: node _asc.mjs <method> <path> [json-body]
//   node _asc.mjs GET /v1/apps
//   node _asc.mjs POST /v1/bundleIds '{"data":{...}}'
import fs from "node:fs";
import crypto from "node:crypto";

const KEY_PATH = "/Users/metaclaw/.credentials/apple/AuthKey_RN74J9796Q.p8";
const KEY_ID   = "RN74J9796Q";
const ISSUER   = "ff24cee4-dcf9-45eb-b44f-1ff7f975ad2b";

function jwt() {
  const key = fs.readFileSync(KEY_PATH, "utf8");
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER, exp: now + 1200, aud: "appstoreconnect-v1" };
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = b64u(header) + "." + b64u(payload);
  const sig = crypto.createSign("SHA256")
    .update(signingInput)
    .sign({ key, dsaEncoding: "ieee-p1363" });
  return signingInput + "." + sig.toString("base64url");
}

const [, , method = "GET", path = "/v1/apps", body] = process.argv;
const r = await fetch("https://api.appstoreconnect.apple.com" + path, {
  method,
  headers: {
    Authorization: "Bearer " + jwt(),
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: body || undefined,
});
const text = await r.text();
console.log("status", r.status);
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
catch { console.log(text); }
