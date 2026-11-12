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
import { ringFlowMax, ringFlowPlan, ringJoinPlan, ringMergePlan, ringSuggestedAction, type RingFlowBalances } from "./flow";
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

const L = (sol: number) => BigInt(Math.round(sol * 1e9));
const U = (usdc: number) => BigInt(Math.round(usdc * 1e6));
const bal = (o: Partial<RingFlowBalances> & { sol?: [number, number]; usdc?: [number, number] } = {}): RingFlowBalances => ({
  registered: o.registered ?? true,
  mergingEnabled: o.mergingEnabled ?? true,
  publicLamports: o.publicLamports ?? L(0.0399),
  publicUsdc: o.publicUsdc ?? U(5),
  assets: o.assets ?? {
    SOL: { amount: L(o.sol?.[0] ?? 0.01), spendable: L(o.sol?.[0] ?? 0.01), notes: o.sol?.[1] ?? 1 },
    USDC: { amount: U(o.usdc?.[0] ?? 0), spendable: U(o.usdc?.[0] ?? 0), notes: o.usdc?.[1] ?? 0 },
  },
});
const ADDR_OK = "private-transfer" as const;

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

test("failover uses redirect:manual and refuses redirects without leaking Location", async () => {
  const hosts = ["https://secret-one.example.com", "https://secret-two.example.com"];
  const inits: Array<RequestInit | undefined> = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    inits.push(init);
    if (url.startsWith(hosts[0]!)) {
      return new Response(null, { status: 302, headers: { location: `${hosts[0]}/elsewhere` } });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 9 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const out = await forwardWithFailover({ endpoints: hosts, url: (e) => e, body: rpcReq("getSlot"), fetchImpl: fakeFetch });
  assert.equal(out.status, 200);
  assert.equal(out.endpointIndex, 1);
  assert.ok(inits.every((init) => init?.redirect === "manual"));

  const onlyRedirect = (async () =>
    new Response(null, { status: 301, headers: { location: "https://secret-one.example.com/x" } })) as unknown as typeof fetch;
  const bad = await forwardWithFailover({ endpoints: [hosts[0]!], url: (e) => e, body: "{}", fetchImpl: onlyRedirect });
  const text = typeof bad.body === "string" ? bad.body : new TextDecoder().decode(bad.body);
  assert.equal(bad.status, 502);
  assert.ok(text.includes("redirected"));
  assert.ok(!text.includes("secret-one"));
  assert.ok(!text.includes("example.com"));
});

test("explainRingError hides kit 8100002 dumps and does not confuse CORS with Face ID", () => {
  const dump =
    "Solana error #8100002; Decode this error by running `npx @solana/errors decode -- 8100002 'X19jb2RlPTgxMDAwMDImaGVhZGVycz0lNUJvYmplY3QlMjBIZWFkZXJzJTVEJm1lc3NhZ2U9JnN0YXR1c0NvZGU9NTAy'`";
  const friendly = "The Ring couldn't be reached just then. Nothing was sent — try again in a moment.";
  assert.equal(explainRingError(new Error(dump)), friendly);
  assert.equal(explainRingError(new Error("Ring endpoint 2 did not answer.")), friendly);
  assert.equal(explainRingError(new Error("Network connection lost.")), friendly);
  assert.ok(!explainRingError(new Error(dump)).toLowerCase().includes("npx"));
  assert.equal(explainRingError(new Error("Cross-origin requests are not allowed.")), "Cross-origin requests are not allowed.");
  assert.equal(explainRingError(Object.assign(new Error("The user cancelled the operation."), { name: "NotAllowedError" })), "Face ID was cancelled. Nothing was sent.");
  assert.ok(!explainRingError(new Error("RPC method not allowed: getHealth")).includes("Face ID"));
  const unknownMint = "That token isn't loaded on your private balance yet. Try SOL, or refresh and try again.";
  assert.equal(explainRingError(Object.assign(new Error("TRANSACTION_UNKNOWN_MINT"), { code: "TRANSACTION_UNKNOWN_MINT" })), unknownMint);
  assert.equal(explainRingError(new Error("TRANSACTION_UNKNOWN_MINT")), unknownMint);
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

test("flow: Sal's screenshot case says exactly how much is missing instead of a grey button", () => {
  // 0.01 private, 0.0399 public, send 0.05 to a Ring user.
  const plan = ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.05", recipient: ADDR_OK, balances: bal() });
  assert.equal(plan.status, "blocked");
  if (plan.status !== "blocked") return;
  // 0.0399 - 0.005 fee reserve = 0.0349 shieldable; 0.04 needed → 0.0051 short; max 0.0449.
  assert.match(plan.reason, /0\.0051 SOL short/);
  assert.match(plan.reason, /0\.0449 SOL/);
  assert.equal(plan.suggestAmount, L(0.0449));
});

test("flow: amount above private but covered by public → shield first, then send", () => {
  const plan = ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.03", recipient: ADDR_OK, balances: bal() });
  assert.equal(plan.status, "shield-first");
  if (plan.status !== "shield-first") return;
  assert.equal(plan.shieldAmount, L(0.02));
  assert.equal(plan.amount, L(0.03));
  assert.match(plan.reason, /You have 0\.01 SOL private\. Shield 0\.02 SOL more/);
});

test("flow: within private balance is ready", () => {
  const plan = ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.01", recipient: ADDR_OK, balances: bal() });
  assert.deepEqual(plan, { status: "ready", amount: L(0.01) });
});

test("flow: every blocked state has a reason", () => {
  const b = bal();
  const cases = [
    ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.01", recipient: "empty", balances: b }),
    ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.01", recipient: "invalid", balances: b }),
    ringFlowPlan({ action: "send", asset: "SOL", amountText: "", recipient: ADDR_OK, balances: b }),
    ringFlowPlan({ action: "send", asset: "SOL", amountText: "0", recipient: ADDR_OK, balances: b }),
    ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.0000000001", recipient: ADDR_OK, balances: b }),
    ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.01", recipient: "lookup-failed", balances: b }),
  ];
  for (const c of cases) {
    assert.equal(c.status, "blocked");
    if (c.status === "blocked") assert.ok(c.reason.length > 10, c.reason);
  }
  assert.match((cases[1] as { reason: string }).reason, /valid Solana address/);
  assert.equal((cases[5] as { fix?: string }).fix, "retry-lookup");
  const checking = ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.01", recipient: "checking", balances: b });
  assert.equal(checking.status, "loading");
});

test("flow: not registered leads into Join for every action", () => {
  for (const action of ["shield", "send", "link", "unshield"] as const) {
    const plan = ringFlowPlan({ action, asset: "SOL", amountText: "0.01", recipient: ADDR_OK, balances: bal({ registered: false }) });
    assert.equal(plan.status, "blocked");
    if (plan.status === "blocked") assert.equal(plan.fix, "join");
  }
  assert.equal(ringJoinPlan(bal({ registered: false })).status, "ready");
  const poor = ringJoinPlan(bal({ registered: false, publicLamports: L(0.001) }));
  assert.equal(poor.status, "blocked");
  assert.equal(ringMergePlan(bal({ registered: false }), "SOL").status, "blocked");
});

test("flow: pay link needs shielded balance plus the link fee", () => {
  // 0 USDC private, 5 public → shield 2 then fund link.
  const ok = ringFlowPlan({ action: "link", asset: "USDC", amountText: "2", balances: bal() });
  assert.equal(ok.status, "shield-first");
  if (ok.status === "shield-first") assert.equal(ok.shieldAmount, U(2));
  const tooMuch = ringFlowPlan({ action: "link", asset: "USDC", amountText: "6", balances: bal() });
  assert.equal(tooMuch.status, "blocked");
  if (tooMuch.status === "blocked") assert.match(tooMuch.reason, /1 USDC short/);
  // SOL link: shieldable = 0.0399 - 0.005 - 0.0025 = 0.0324; with 0.01 private → max 0.0424.
  assert.equal(ringFlowMax({ action: "link", asset: "SOL", balances: bal() }), L(0.0424));
  const noFee = ringFlowPlan({ action: "link", asset: "USDC", amountText: "1", balances: bal({ publicLamports: L(0.001) }) });
  assert.equal(noFee.status, "blocked");
  if (noFee.status === "blocked") assert.match(noFee.reason, /claimer's fees/);
});

test("flow: unshield and public withdrawals never shield first", () => {
  const u = ringFlowPlan({ action: "unshield", asset: "SOL", amountText: "0.02", recipient: ADDR_OK, balances: bal() });
  assert.equal(u.status, "blocked");
  if (u.status === "blocked") assert.equal(u.suggestAmount, L(0.01));
  const w = ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.02", recipient: "public-withdrawal", balances: bal() });
  assert.equal(w.status, "blocked");
  if (w.status === "blocked") assert.match(w.reason, /public withdrawal/);
  assert.equal(ringFlowMax({ action: "unshield", asset: "SOL", balances: bal() }), L(0.01));
});

test("flow: shield keeps a fee reserve and Max respects it", () => {
  assert.equal(ringFlowMax({ action: "shield", asset: "SOL", balances: bal() }), L(0.0349));
  const over = ringFlowPlan({ action: "shield", asset: "SOL", amountText: "0.0399", balances: bal() });
  assert.equal(over.status, "blocked");
  if (over.status === "blocked") assert.equal(over.suggestAmount, L(0.0349));
  assert.equal(ringFlowPlan({ action: "shield", asset: "USDC", amountText: "5", balances: bal() }).status, "ready");
  assert.equal(ringFlowPlan({ action: "shield", asset: "USDC", amountText: "5.01", balances: bal() }).status, "blocked");
});

test("flow: too many notes → merge first", () => {
  const b = bal();
  b.assets.SOL = { amount: L(1), spendable: L(0.5), notes: 12 };
  const plan = ringFlowPlan({ action: "send", asset: "SOL", amountText: "0.8", recipient: ADDR_OK, balances: b });
  assert.equal(plan.status, "blocked");
  if (plan.status === "blocked") {
    assert.equal(plan.fix, "merge");
    assert.equal(plan.suggestAmount, L(0.5));
  }
  const m = ringMergePlan(bal({ mergingEnabled: false, sol: [0.01, 3] }), "SOL");
  assert.equal(m.status === "blocked" && m.fix, "enable-merging");
  assert.equal(ringMergePlan(bal(), "SOL").status, "blocked"); // 1 note
  assert.equal(ringMergePlan(bal({ sol: [0.01, 3] }), "SOL").status, "ready");
});

test("flow: guide order opens Shield until there's a private balance", () => {
  assert.equal(ringSuggestedAction(bal({ registered: false })), "shield");
  assert.equal(ringSuggestedAction(bal({ sol: [0, 0] })), "shield");
  assert.equal(ringSuggestedAction(bal()), "send");
  assert.equal(ringSuggestedAction(null), "shield");
});
