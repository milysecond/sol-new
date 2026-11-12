import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { formatRingAmount, parseRingAmount } from "./amount";
import {
  RING_LINK_FEE_LAMPORTS,
  RING_PRIORITY_FEE_LAMPORTS,
  RING_REGISTRY_RECORD_RENT_LAMPORTS,
  RING_SHIELDED_POOL_PROGRAM_ID,
  RING_SIGNATURE_FEE_LAMPORTS,
  RING_SYSTEM_ACCOUNT_RENT_LAMPORTS,
  RING_USER_REGISTRY_PROGRAM_ID,
} from "./constants";
import { RING_BETA_NOTE, RING_PRIVACY_POINTS, ringHistoryLabel, ringSendKind, ringSendLabel } from "./copy";
import { explainRingError, RingNeedsWithdrawalError } from "./errors";
import { createRingLinkSecret, parsePastedRingLink, parseRingLink, ringLinkUrl } from "./link";
import {
  checkRpcBody,
  checkSprBody,
  forwardWithFailover,
  isAllowedOrigin,
  parseEndpointPool,
  RING_ENDPOINTS_ENV,
  SPR_METHODS,
  sprUpstreamUrl,
} from "./proxy";

if (!globalThis.crypto) (globalThis as { crypto?: unknown }).crypto = webcrypto;

const rpcReq = (method: string, params: unknown[] = []) => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });

test("amounts parse and format exactly", () => {
  assert.equal(parseRingAmount("1", 9), BigInt(1_000_000_000));
  assert.equal(parseRingAmount("0.000000001", 9), BigInt(1));
  assert.equal(parseRingAmount("12.5", 6), BigInt(12_500_000));
  assert.equal(parseRingAmount("1,000.25", 6), BigInt(1_000_250_000));
  assert.equal(parseRingAmount("0.0000001", 6), null);
  assert.equal(parseRingAmount("abc", 6), null);
  assert.equal(parseRingAmount("", 6), null);
  assert.equal(formatRingAmount(BigInt(1_000_250_000), 6), "1,000.25");
  assert.equal(formatRingAmount(BigInt(1), 9), "0.000000001");
  assert.equal(formatRingAmount(BigInt(1_234_567_891), 9, 4), "1.2345");
});

test("pay link secret lives only in the fragment and must match the address", () => {
  const link = createRingLinkSecret();
  const url = ringLinkUrl(link.address, link.secret);
  const u = new URL(url);
  assert.equal(u.origin, "https://sol.new");
  assert.equal(u.pathname, `/ring/c/${link.address}`);
  assert.equal(u.search, "");
  assert.equal(u.hash, `#${link.secret}`);
  assert.ok(!u.pathname.includes(link.secret));

  const ok = parseRingLink({ pathname: u.pathname, hash: u.hash });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.address, link.address);
    assert.deepEqual(Array.from(ok.seed), Array.from(link.seed));
  }
  assert.deepEqual(parseRingLink({ pathname: u.pathname, hash: "" }), { ok: false, reason: "no-secret" });
  assert.deepEqual(parseRingLink({ pathname: u.pathname, hash: "#nope" }), { ok: false, reason: "bad-secret" });
  const other = createRingLinkSecret();
  assert.deepEqual(parseRingLink({ pathname: u.pathname, hash: `#${other.secret}` }), { ok: false, reason: "mismatch" });
  assert.deepEqual(parseRingLink({ pathname: "/ring/c", hash: u.hash }), { ok: false, reason: "no-address" });
  assert.equal(parsePastedRingLink(`  ${url}  `).ok, true);
});

test("endpoint pool: https only, deduped, no trailing slash", () => {
  assert.deepEqual(parseEndpointPool(undefined), []);
  assert.deepEqual(
    parseEndpointPool("https://a.example.com/, https://b.example.com\nhttp://insecure.example.com,https://a.example.com,nonsense"),
    ["https://a.example.com", "https://b.example.com"],
  );
  assert.equal(RING_ENDPOINTS_ENV, "HELIUS_SPR_RPC_URLS");
  assert.equal(sprUpstreamUrl("https://x.example.com", "getUserRecords"), "https://x.example.com/v1/spr/getUserRecords");
  assert.equal(
    sprUpstreamUrl("https://x.example.com/?api-key=k", "getMerkleProofs"),
    "https://x.example.com/v1/spr/getMerkleProofs?api-key=k",
  );
});

test("RPC proxy allow-list", () => {
  assert.equal(checkRpcBody(rpcReq("getAccountInfo", ["x"])).ok, true);
  assert.equal(checkRpcBody(rpcReq("sendTransaction", ["x"])).ok, true);
  assert.equal(checkRpcBody(rpcReq("getProgramAccounts", [RING_USER_REGISTRY_PROGRAM_ID])).ok, true);
  assert.equal(checkRpcBody(rpcReq("getProgramAccounts", [RING_SHIELDED_POOL_PROGRAM_ID])).ok, true);
  const gpa = checkRpcBody(rpcReq("getProgramAccounts", ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]));
  assert.equal(gpa.ok, false);
  const das = checkRpcBody(rpcReq("getAssetsByOwner"));
  assert.equal(das.ok, false);
  if (!das.ok) assert.equal(das.status, 403);
  assert.equal(checkRpcBody(`[${rpcReq("getSlot")}]`).ok, false);
  assert.equal(checkRpcBody("not json").ok, false);
  assert.equal(checkRpcBody(JSON.stringify({ id: 1, method: "getSlot" })).ok, false);
});

test("SPR proxy: path method must be a known indexer method and match the body", () => {
  for (const m of SPR_METHODS) assert.equal(checkSprBody(rpcReq(m), m).ok, true);
  assert.equal(checkSprBody(rpcReq("getEncryptedUtxos"), "getEncryptedUtxos").ok, false);
  assert.equal(checkSprBody(rpcReq("getUserRecords"), "getMerkleProofs").ok, false);
});

test("origin check is same-origin or sol.new / local", () => {
  assert.equal(isAllowedOrigin("https://sol.new", "https://sol.new/api/ring/rpc"), true);
  assert.equal(isAllowedOrigin("https://dev.sol.new", "https://sol.new/api/ring/rpc"), true);
  assert.equal(isAllowedOrigin("http://localhost:3000", "http://localhost:3000/api/ring/rpc"), true);
  assert.equal(isAllowedOrigin("https://preview.workers.dev", "https://preview.workers.dev/api/ring/rpc"), true);
  assert.equal(isAllowedOrigin("https://evil.example", "https://sol.new/api/ring/rpc"), false);
  assert.equal(isAllowedOrigin("https://sol.new.evil.example", "https://sol.new/api/ring/rpc"), false);
  assert.equal(isAllowedOrigin(null, "https://sol.new/api/ring/rpc"), false);
});

test("failover skips a refusing endpoint and never echoes upstream hosts", async () => {
  const hosts = ["https://secret-one.example.com", "https://secret-two.example.com"];
  const calls: string[] = [];
  const fakeFetch = (async (url: string) => {
    calls.push(url);
    if (url.startsWith(hosts[0]!)) return new Response(`denied for ${hosts[0]}`, { status: 403 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 7 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const out = await forwardWithFailover({ endpoints: hosts, url: (e) => e, body: rpcReq("getSlot"), fetchImpl: fakeFetch });
  assert.equal(out.status, 200);
  assert.equal(out.endpointIndex, 1);
  assert.equal(calls.length, 2);

  const allBad = (async (url: string) => new Response(`upstream ${url} broke`, { status: 503 })) as unknown as typeof fetch;
  const bad = await forwardWithFailover({ endpoints: hosts, url: (e) => e, body: "{}", fetchImpl: allBad });
  const text = typeof bad.body === "string" ? bad.body : new TextDecoder().decode(bad.body);
  assert.equal(bad.status, 502);
  for (const h of hosts) assert.ok(!text.includes(new URL(h).hostname));
  assert.ok(!explainRingError(new Error(`fetch failed ${hosts[0]}/v1/spr`)).includes("secret-one"));
});

test("honest copy: confidential, not anonymous; non-Ring sends are withdrawals", () => {
  assert.equal(ringSendKind(true), "private-transfer");
  assert.equal(ringSendKind(false), "public-withdrawal");
  assert.equal(ringSendLabel("public-withdrawal"), "Public withdrawal");
  const all = RING_PRIVACY_POINTS.join(" ").toLowerCase();
  assert.ok(all.includes("not anonymous"));
  assert.ok(all.includes("public withdrawal"));
  assert.ok(all.includes("shielding") && all.includes("shows the amount"));
  assert.ok(RING_BETA_NOTE.includes("formal verification") && RING_BETA_NOTE.includes("2026"));
  assert.equal(ringHistoryLabel("publicWithdrawal", "outbound").visibility, "amount public");
  assert.equal(ringHistoryLabel("deposit", "inbound").visibility, "amount public");
  assert.equal(ringHistoryLabel("privateTransfer", "inbound").visibility, "amount private");
  assert.match(new RingNeedsWithdrawalError("x").message, /public withdrawal/);
});

test("pay-link fee budget covers first-time claim and keeps the link wallet rent-exempt", () => {
  const spent =
    RING_REGISTRY_RECORD_RENT_LAMPORTS +
    RING_SIGNATURE_FEE_LAMPORTS * BigInt(2) + // registration: claimer + link wallet
    RING_SIGNATURE_FEE_LAMPORTS +
    RING_PRIORITY_FEE_LAMPORTS + // private transfer
    RING_SIGNATURE_FEE_LAMPORTS; // sweep
  assert.ok(RING_LINK_FEE_LAMPORTS - spent + RING_SIGNATURE_FEE_LAMPORTS >= RING_SYSTEM_ACCOUNT_RENT_LAMPORTS);
});

test("SDK: program IDs match, shielded keys follow the official TSPP/derive/v1 derivation", async () => {
  const spr = await import("@heliuslabs/spr");
  const kit = await import("@solana/kit");
  const { ed25519DerivationMessage } = await import("@heliuslabs/spr/keypair");
  assert.equal(spr.SHIELDED_POOL_PROGRAM_ID, RING_SHIELDED_POOL_PROGRAM_ID);
  assert.equal(spr.USER_REGISTRY_PROGRAM_ID, RING_USER_REGISTRY_PROGRAM_ID);
  await spr.initializePoseidon();

  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(seed));
  const kp = spr.ShieldedKeypair.fromKeypair(spr.SigningKey.fromEd25519Bytes(new Uint8Array(seed) as never));
  assert.equal(kp.shieldedAddress().solanaAddress(), signer.address);

  const pub = new Uint8Array(kit.getAddressEncoder().encode(signer.address));
  const sig = await kit.signBytes(signer.keyPair.privateKey, ed25519DerivationMessage(pub as never));
  const proofs = { prove: async () => { throw new Error("unused"); }, proveMerge: async () => { throw new Error("unused"); } };
  const fromSig = spr.LocalKeys.fromDerivationSeed({ solanaPublicKey: signer.address, derivationSeed: new Uint8Array(sig) }, proofs as never);
  assert.deepEqual(Array.from(fromSig.address().toBytes()), Array.from(kp.shieldedAddress().toBytes()));
});

/** Read-only mainnet probes. RING_PROBE=1 HELIUS_SPR_RPC_URLS=… npm run test:ring */
const PROBE = process.env.RING_PROBE === "1";
const endpoints = parseEndpointPool(process.env[RING_ENDPOINTS_ENV]);

async function rpc(url: string, method: string, params: unknown[]) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: rpcReq(method, params) });
  return (await r.json()) as { result?: { value?: unknown } & Record<string, unknown>; error?: unknown };
}

test("probe: Ring programs are executable upgradeable programs on mainnet", { skip: !PROBE || endpoints.length === 0 }, async () => {
  for (const id of [RING_SHIELDED_POOL_PROGRAM_ID, RING_USER_REGISTRY_PROGRAM_ID]) {
    const r = await rpc(endpoints[0]!, "getAccountInfo", [id, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]);
    const v = r.result?.value as { owner?: string; executable?: boolean } | undefined;
    assert.equal(v?.owner, "BPFLoaderUpgradeab1e11111111111111111111111");
    assert.equal(v?.executable, true);
  }
});

test("probe: privacy indexer answers each method on every pooled endpoint", { skip: !PROBE || endpoints.length === 0 }, async () => {
  for (const [i, e] of endpoints.entries()) {
    for (const m of SPR_METHODS) {
      const out = await forwardWithFailover({ endpoints: [e], url: (x) => sprUpstreamUrl(x, m), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: {} }) });
      const body = JSON.parse(typeof out.body === "string" ? out.body : new TextDecoder().decode(out.body)) as { error?: { code?: number } };
      assert.equal(out.status, 200, `endpoint ${i + 1} ${m}`);
      assert.equal(body.error?.code, -32602, `endpoint ${i + 1} ${m} invalid params`);
    }
  }
});

test("probe: SDK syncs an empty wallet and simulates registration + deposit (nothing sent)", { skip: !PROBE || endpoints.length === 0 }, async () => {
  const spr = await import("@heliuslabs/spr");
  const kit = await import("@solana/kit");
  const { isWalletRegistered } = await import("@heliuslabs/spr/wallet");
  const client = await spr.createSprClient({ solanaRpcUrl: endpoints[0]! });
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(seed));
  const kp = spr.ShieldedKeypair.fromKeypair(spr.SigningKey.fromEd25519Bytes(new Uint8Array(seed) as never));
  assert.equal(await isWalletRegistered({ rpc: client, owner: signer.address }), false);
  const wallet = new spr.Wallet({ identity: kp.shieldedAddress() });
  await spr.syncWallet({ client, wallet, keys: spr.LocalKeys.fromKeypair(kp, client.proofService) });
  assert.equal(spr.getPrivateTokenBalances(wallet).length, 0);

  // Simulation only (sigVerify off) with a well-funded fee payer. Spends nothing.
  const payer = (process.env.RING_PROBE_PAYER || "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9") as never;
  const reg = await spr.buildRegistrationTransaction({ client, owner: signer.address, address: kp.shieldedAddress(), payer });
  assert.ok(reg);
  const dep = await spr.buildDepositTransaction({ client, feePayer: payer, recipient: kp.shieldedAddress(), amount: BigInt(1_000_000) });
  for (const tx of [reg!, dep]) {
    const r = await rpc(endpoints[0]!, "simulateTransaction", [
      kit.getBase64EncodedWireTransaction(tx),
      { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true },
    ]);
    const v = r.result?.value as { err?: unknown } | undefined;
    assert.equal(v?.err ?? null, null, JSON.stringify(v?.err ?? r.error));
  }
});
