/**
 * Browser-side Ring runtime.
 *
 * - SDK: @heliuslabs/spr 0.9.0-alpha (with @solana/kit 8).
 * - Proofs: @heliuslabs/spr-web-prover, in a worker on this device. The SDK
 *   sends `/prove` to a loopback URL and the prover's fetch answers it locally.
 * - RPC + privacy indexer: same-origin /api/ring proxies (named Helius hosts
 *   stay server-side).
 * - Keys: the shielded keypair is derived with the official TSPP/derive/v1
 *   message from the SAME Ed25519 seed the sol.new Face ID passkey already
 *   produces, so there is no second secret to back up.
 *
 * Everything here is loaded with dynamic import from client components only.
 */
import type { SprClient } from "@heliuslabs/spr/client";
import type { LocalKeys, ShieldedAddress, ShieldedKeypair, Wallet, WalletStateCipher } from "@heliuslabs/spr";
import type { SprWebProver } from "@heliuslabs/spr-web-prover";
import type { Address, KeyPairSigner, Transaction } from "@solana/kit";
import {
  RING_ASSETS,
  RING_LINK_FEE_LAMPORTS,
  RING_LOCAL_PROVER_URL,
  RING_MAX_LOCAL_INPUTS,
  RING_PRIORITY_FEE_LAMPORTS,
  RING_RPC_PATH,
  RING_SIGNATURE_FEE_LAMPORTS,
  RING_SPR_PATH,
  RING_STORAGE_PREFIX,
  type RingAssetId,
} from "./constants";
import { confirmRpcSignature } from "./confirm";
import { RingMergeFirstError, RingNeedsWithdrawalError } from "./errors";
import { createRingLinkSecret, ringLinkUrl, seedFromRingSecret } from "./link";
import { classifyPayLinkFunding, expectedAmountOf } from "./pay-link-status";

type Spr = typeof import("@heliuslabs/spr");
type Kit = typeof import("@solana/kit");

export type KeyProgressInfo = { keyFile: string; stage: "download" | "decode"; loaded: number; total: number };

export type RingRuntime = {
  spr: Spr;
  kit: Kit;
  client: SprClient;
  prover: SprWebProver;
  solMint: Address;
};

export type RingSession = {
  owner: Address;
  signer: KeyPairSigner;
  keypair: ShieldedKeypair;
  keys: LocalKeys;
  wallet: Wallet;
  address: ShieldedAddress;
  /** Encrypted local snapshot (main wallet only; pay-link wallets are not persisted). */
  persist: { cipher: WalletStateCipher; storageKey: string } | null;
};

export type RingAssetView = {
  id: RingAssetId;
  amount: bigint;
  notes: number;
  /** Most one local proof can spend (largest RING_MAX_LOCAL_INPUTS notes). */
  spendable: bigint;
};

export type RingHistoryRow = {
  key: string;
  signature: string;
  slot: bigint;
  kind: "deposit" | "privateTransfer" | "ringEntry" | "publicWithdrawal" | "split" | "merge";
  direction: "inbound" | "outbound" | "selfTransfer";
  asset: RingAssetId | "OTHER";
  amount: bigint;
};

export type RingSnapshot = {
  registered: boolean;
  mergingEnabled: boolean;
  publicLamports: bigint;
  publicUsdc: bigint;
  assets: Record<RingAssetId, RingAssetView>;
  history: RingHistoryRow[];
};

let runtimePromise: Promise<RingRuntime> | null = null;
let progressListener: ((p: KeyProgressInfo) => void) | null = null;

export function onRingKeyProgress(fn: ((p: KeyProgressInfo) => void) | null) {
  progressListener = fn;
}

function origin(): string {
  return window.location.origin;
}

/** Refuse local proofs that spend more notes than the browser example allows. */
function limitLocalProofs(localFetch: typeof fetch): typeof fetch {
  const proverOrigin = new URL(RING_LOCAL_PROVER_URL).origin;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === proverOrigin && /^\/prove(?:\/|$)/u.test(url.pathname)) {
      const request = new Request(input, init);
      if (request.method === "POST") {
        const body = (await request.clone().json()) as { inputs?: unknown };
        if (Array.isArray(body.inputs) && body.inputs.length > RING_MAX_LOCAL_INPUTS) {
          throw new RingMergeFirstError(RING_MAX_LOCAL_INPUTS);
        }
      }
    }
    return localFetch(input, init);
  };
}

export function getRingRuntime(): Promise<RingRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const [spr, kit, web] = await Promise.all([
        import("@heliuslabs/spr"),
        import("@solana/kit"),
        import("@heliuslabs/spr-web-prover"),
      ]);
      const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
      const prover = new web.SprWebProver({
        proverUrl: RING_LOCAL_PROVER_URL,
        // Without cross-origin isolation the threaded runtime can't start.
        ...(isolated ? {} : { threads: 0 }),
        persistStorage: true,
        onKeyProgress: (p) => progressListener?.(p),
      });
      const client = await spr.createSprClient({
        solanaRpcUrl: `${origin()}${RING_RPC_PATH}`,
        indexerUrl: `${origin()}${RING_SPR_PATH}`,
        // Loopback: no TEE policy needed, nothing leaves the device.
        proverUrl: RING_LOCAL_PROVER_URL,
        proofDataSource: "client",
        fetch: limitLocalProofs(prover.createFetch()),
        priorityFeeLamports: RING_PRIORITY_FEE_LAMPORTS,
      });
      return { spr, kit, client, prover, solMint: spr.SOL_MINT };
    })().catch((e) => {
      runtimePromise = null;
      throw e;
    });
  }
  return runtimePromise;
}

export async function ringStatus(): Promise<{ configured: boolean }> {
  try {
    const r = await fetch("/api/ring/status", { cache: "no-store" });
    const j = (await r.json()) as { configured?: boolean };
    return { configured: Boolean(j.configured) };
  } catch {
    return { configured: false };
  }
}

function mintFor(rt: RingRuntime, id: RingAssetId): Address {
  const m = RING_ASSETS[id].mint;
  return (m ?? rt.solMint) as Address;
}

function assetIdFor(rt: RingRuntime, mint: string): RingAssetId | "OTHER" {
  if (mint === rt.solMint) return "SOL";
  if (mint === RING_ASSETS.USDC.mint) return "USDC";
  return "OTHER";
}

/**
 * Open a Ring session from a 32-byte Ed25519 seed.
 * `persist` stores an encrypted wallet snapshot in localStorage.
 */
export async function openRingSession(seed: Uint8Array, opts: { persist: boolean }): Promise<RingSession> {
  const rt = await getRingRuntime();
  const { spr, kit } = rt;
  const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(seed));
  // Same derivation as LocalKeys.fromDerivationSeed over TSPP/derive/v1 (tested in ring.test.ts).
  const keypair = spr.ShieldedKeypair.fromKeypair(spr.SigningKey.fromEd25519Bytes(new Uint8Array(seed) as never));
  const keys = spr.LocalKeys.fromKeypair(keypair, rt.client.proofService);
  const address = keypair.shieldedAddress();
  let wallet: Wallet | undefined;
  let persist: RingSession["persist"] = null;
  if (opts.persist) {
    const storageKey = `${RING_STORAGE_PREFIX}.wallet.${signer.address}`;
    const cipher = spr.walletSnapshotCipher(keypair);
    persist = { cipher, storageKey };
    try {
      wallet = await spr.loadPersistedWallet({
        store: { load: async () => localStorage.getItem(storageKey) ?? undefined },
        cipher,
      });
    } catch {
      localStorage.removeItem(storageKey);
    }
  }
  wallet ??= new spr.Wallet({ identity: address });
  return { owner: signer.address, signer, keypair, keys, wallet, address, persist };
}

export async function syncRing(session: RingSession, requireSlot?: bigint): Promise<void> {
  const rt = await getRingRuntime();
  const config = requireSlot === undefined ? {} : { requireSlot };
  if (session.persist) {
    const { storageKey, cipher } = session.persist;
    await rt.spr.syncPersistedWallet({
      client: rt.client,
      wallet: session.wallet,
      keys: session.keys,
      config,
      cipher,
      store: { save: async (s) => localStorage.setItem(storageKey, s) },
    });
  } else {
    await rt.spr.syncWallet({ client: rt.client, wallet: session.wallet, keys: session.keys, config });
  }
}

async function usdcAta(rt: RingRuntime, owner: Address): Promise<Address> {
  const token = await import("@solana-program/token");
  const [ata] = await token.findAssociatedTokenPda({
    owner,
    mint: RING_ASSETS.USDC.mint as Address,
    tokenProgram: token.TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

export async function publicBalances(owner: Address): Promise<{ lamports: bigint; usdc: bigint }> {
  const rt = await getRingRuntime();
  const rpc = rt.client.solanaRpc;
  const [{ value: lamports }, usdc] = await Promise.all([
    rpc.getBalance(owner).send(),
    (async () => {
      try {
        const ata = await usdcAta(rt, owner);
        const { value } = await rpc.getTokenAccountBalance(ata).send();
        return BigInt(value.amount);
      } catch {
        return BigInt(0);
      }
    })(),
  ]);
  return { lamports, usdc };
}

function isUnknownMint(e: unknown): boolean {
  const anyE = e as { code?: unknown; message?: unknown } | null;
  const code = typeof anyE?.code === "string" ? anyE.code : "";
  const msg = typeof anyE?.message === "string" ? anyE.message : String(e ?? "");
  return code === "TRANSACTION_UNKNOWN_MINT" || msg.includes("TRANSACTION_UNKNOWN_MINT");
}

/**
 * A fresh SDK wallet only has SOL in its local registry. The on-chain USDC
 * registration is loaded during sync only if a private USDC note is already
 * present — so a first-time snapshot that asked `wallet.balance(USDC)` threw
 * TRANSACTION_UNKNOWN_MINT and "Join the Default Ring" never appeared.
 */
async function ensureKnownAssets(rt: RingRuntime, session: RingSession): Promise<void> {
  try {
    session.wallet.balance(mintFor(rt, "USDC"));
    return;
  } catch (e) {
    if (!isUnknownMint(e)) throw e;
  }
  try {
    const { backfillAssetRegistry } = await import("@heliuslabs/spr/wallet");
    await backfillAssetRegistry(session.wallet, {
      solanaRpc: rt.client.solanaRpc,
      commitment: rt.client.commitment,
    });
  } catch {
    // Registry scan failed; SOL still works, USDC stays at zero below.
  }
}

function assetView(rt: RingRuntime, session: RingSession, id: RingAssetId): RingAssetView {
  try {
    const bal = session.wallet.balance(mintFor(rt, id));
    const sorted = [...bal.utxos].map((u) => u.amount).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    const spendable = sorted.slice(0, RING_MAX_LOCAL_INPUTS).reduce((t, a) => t + a, BigInt(0));
    return { id, amount: bal.amount, notes: bal.utxos.length, spendable };
  } catch (e) {
    if (isUnknownMint(e)) return { id, amount: BigInt(0), notes: 0, spendable: BigInt(0) };
    throw e;
  }
}

export async function ringSnapshot(session: RingSession, opts: { sync: boolean; requireSlot?: bigint }): Promise<RingSnapshot> {
  const rt = await getRingRuntime();
  const { fetchUserRecord } = await import("@heliuslabs/spr/wallet");
  const [record, pub] = await Promise.all([
    fetchUserRecord({ rpc: rt.client, owner: session.owner }),
    publicBalances(session.owner),
  ]);
  if (opts.sync) await syncRing(session, opts.requireSlot);
  await ensureKnownAssets(rt, session);
  const history = rt.spr
    .getPrivateTransactions(session.wallet)
    .map((t) => ({
      key: `${t.id.signature}:${t.id.index.toString()}`,
      signature: t.id.signature as string,
      slot: t.id.slot,
      kind: t.kind,
      direction: t.direction,
      asset: assetIdFor(rt, t.asset),
      amount: t.amount,
    }))
    .sort((a, b) => (a.slot > b.slot ? -1 : a.slot < b.slot ? 1 : 0));
  return {
    registered: record !== undefined,
    mergingEnabled: record !== undefined && record.mergeEncryption === rt.spr.MergeEncryptionScheme.PoseidonCtrV1,
    publicLamports: pub.lamports,
    publicUsdc: pub.usdc,
    assets: { SOL: assetView(rt, session, "SOL"), USDC: assetView(rt, session, "USDC") },
    history,
  };
}

export async function isRingRegistered(owner: string): Promise<boolean> {
  const rt = await getRingRuntime();
  const { isWalletRegistered } = await import("@heliuslabs/spr/wallet");
  return isWalletRegistered({ rpc: rt.client, owner: owner as Address });
}

async function confirmLanded(rt: RingRuntime, signature: string): Promise<bigint> {
  return confirmRpcSignature(
    {
      getSignatureStatuses: async (sig, opts) => {
        const { value } = await rt.client.solanaRpc
          .getSignatureStatuses([sig as never], { searchTransactionHistory: opts.searchTransactionHistory })
          .send();
        const st = value[0];
        if (st == null) return null;
        return { err: st.err, confirmationStatus: st.confirmationStatus, slot: st.slot };
      },
    },
    signature,
  );
}

/** Sign with every signer, send through the proxy, wait for confirmation. Returns [signature, slot]. */
async function submit(tx: Transaction, signers: KeyPairSigner[]): Promise<{ signature: string; slot: bigint }> {
  const rt = await getRingRuntime();
  const { kit, client } = rt;
  const signed = await kit.signTransactionWithSigners(signers, tx as never);
  await kit.sendTransactionWithoutConfirmingFactory({ rpc: client.solanaRpc })(signed as never, {
    commitment: client.commitment,
  });
  const signature = kit.getSignatureFromTransaction(signed as never);
  // HTTP poll with retries. The SDK's confirmTransaction aborts on the first RPC blip.
  const slot = await confirmLanded(rt, signature);
  return { signature, slot };
}

async function transferSolPublic(from: KeyPairSigner, to: Address, lamports: bigint) {
  const rt = await getRingRuntime();
  const { kit, client } = rt;
  const system = await import("@solana-program/system");
  const { value: bh } = await client.solanaRpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = kit.pipe(
    kit.createTransactionMessage({ version: 0 }),
    (m) => kit.setTransactionMessageFeePayerSigner(from, m),
    (m) => kit.setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => kit.appendTransactionMessageInstruction(system.getTransferSolInstruction({ source: from, destination: to, amount: lamports }), m),
  );
  const signed = await kit.signTransactionMessageWithSigners(message);
  await kit.sendTransactionWithoutConfirmingFactory({ rpc: client.solanaRpc })(signed as never, {
    commitment: client.commitment,
  });
  const signature = kit.getSignatureFromTransaction(signed);
  const slot = await confirmLanded(rt, signature);
  return { signature, slot };
}

/** Register on the Default Ring, then opt in to merging (both signed by the owner). */
export async function registerOnRing(session: RingSession): Promise<bigint | undefined> {
  const rt = await getRingRuntime();
  let slot: bigint | undefined;
  const reg = await rt.spr.buildRegistrationTransaction({
    client: rt.client,
    owner: session.owner,
    address: session.address,
  });
  if (reg) slot = (await submit(reg, [session.signer])).slot;
  slot = (await enableMerging(session)) ?? slot;
  return slot;
}

export async function enableMerging(session: RingSession): Promise<bigint | undefined> {
  const rt = await getRingRuntime();
  const { fetchUserRecord } = await import("@heliuslabs/spr/wallet");
  const rec = await fetchUserRecord({ rpc: rt.client, owner: session.owner });
  if (!rec || rec.mergeEncryption === rt.spr.MergeEncryptionScheme.PoseidonCtrV1) return undefined;
  const tx = await rt.spr.buildSetMergeEncryptionTransaction({
    client: rt.client,
    owner: session.owner,
    scheme: rt.spr.MergeEncryptionScheme.PoseidonCtrV1,
  });
  return (await submit(tx, [session.signer])).slot;
}

/** Public → private. The amount is visible on-chain. */
export async function shield(session: RingSession, asset: RingAssetId, amount: bigint) {
  const rt = await getRingRuntime();
  const tx = await rt.spr.buildDepositTransaction({
    client: rt.client,
    feePayer: session.owner,
    recipient: session.address,
    amount,
    ...(asset === "USDC"
      ? { asset: mintFor(rt, "USDC"), splTokenAccount: await usdcAta(rt, session.owner) }
      : {}),
  });
  return submit(tx, [session.signer]);
}

function checkSpendable(rt: RingRuntime, session: RingSession, asset: RingAssetId, amount: bigint) {
  const v = assetView(rt, session, asset);
  if (amount > v.amount) throw Object.assign(new Error("Not enough private balance."), { code: "WALLET_INSUFFICIENT_FUNDS" });
  if (amount > v.spendable) throw new RingMergeFirstError(RING_MAX_LOCAL_INPUTS);
}

/**
 * Private transfer to a Ring-registered Solana address. Refuses (instead of
 * silently withdrawing) when the recipient isn't registered.
 */
export async function sendPrivate(session: RingSession, recipient: string, asset: RingAssetId, amount: bigint) {
  const rt = await getRingRuntime();
  if (!(await isRingRegistered(recipient))) throw new RingNeedsWithdrawalError(recipient);
  checkSpendable(rt, session, asset, amount);
  const tx = await rt.spr.buildTransferTransaction({
    client: rt.client,
    wallet: session.wallet,
    keys: session.keys,
    feePayer: session.owner,
    recipient: recipient as Address,
    amount,
    ...(asset === "USDC" ? { asset: mintFor(rt, "USDC") } : {}),
  });
  return submit(tx, [session.signer]);
}

/** Private → public. Destination, asset, and amount are visible on-chain. */
export async function withdrawPublic(session: RingSession, recipient: string, asset: RingAssetId, amount: bigint) {
  const rt = await getRingRuntime();
  checkSpendable(rt, session, asset, amount);
  const tx = await rt.spr.buildWithdrawalTransaction({
    client: rt.client,
    wallet: session.wallet,
    keys: session.keys,
    feePayer: session.owner,
    recipient: recipient as Address,
    amount,
    ...(asset === "USDC" ? { asset: mintFor(rt, "USDC") } : {}),
  });
  return submit(tx, [session.signer]);
}

/** Merge the smallest notes of one asset into one (proved on this device). */
export async function mergeNotes(session: RingSession, asset: RingAssetId) {
  const rt = await getRingRuntime();
  const tx = await rt.spr.buildMergeTransaction({
    client: rt.client,
    wallet: session.wallet,
    keys: session.keys,
    feePayer: session.owner,
    ...(asset === "USDC" ? { asset: mintFor(rt, "USDC") } : {}),
  });
  return submit(tx, [session.signer]);
}

// ── Pay links ────────────────────────────────────────────────────────────

export type StoredRingLink = {
  address: string;
  secret: string;
  asset: RingAssetId;
  amount: string;
  createdAt: number;
  status: "funding" | "ready" | "claimed";
  note?: string;
};

const LINKS_KEY = `${RING_STORAGE_PREFIX}.links`;

export function loadRingLinks(): StoredRingLink[] {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) || "[]") as StoredRingLink[];
  } catch {
    return [];
  }
}

export function saveRingLink(link: StoredRingLink) {
  const all = loadRingLinks().filter((l) => l.address !== link.address);
  all.unshift(link);
  localStorage.setItem(LINKS_KEY, JSON.stringify(all.slice(0, 50)));
}

export type PayLinkStep = "saved" | "prove" | "fee" | "transfer";

async function openStoredLinkSession(secret: string): Promise<RingSession> {
  const seed = seedFromRingSecret(secret);
  if (!seed) throw new Error("This saved link is damaged. It can't be checked from this device.");
  try {
    return await openRingSession(seed, { persist: false });
  } finally {
    seed.fill(0);
  }
}

/** Re-read a saved link on-chain and mark it ready if the private funds already arrived. */
export async function refreshPayLinkStatus(link: StoredRingLink): Promise<StoredRingLink> {
  if (link.status !== "funding") return link;
  let ephemeral: RingSession | null = null;
  try {
    ephemeral = await openStoredLinkSession(link.secret);
    const contents = await inspectPayLink(ephemeral);
    const kind = classifyPayLinkFunding({
      publicLamports: contents.publicLamports,
      privateAmount: contents.assets[link.asset]?.amount ?? BigInt(0),
      expectedAmount: expectedAmountOf(link.amount),
    });
    if (kind === "funded") {
      const ready: StoredRingLink = { ...link, status: "ready" };
      saveRingLink(ready);
      return ready;
    }
    return link;
  } catch {
    return link;
  } finally {
    destroyRingSession(ephemeral);
  }
}

/**
 * Fund a pay link from the sender's PRIVATE balance:
 *  1. prove the private transfer on this device (no on-chain effect yet),
 *  2. public SOL to the link wallet for the claimer's fees (RING_LINK_FEE_LAMPORTS),
 *  3. private transfer of `amount` to the link's shielded address (amount hidden).
 * The link is saved locally first so a half-funded link can still be finished.
 * Proving happens before the fee so a stuck/failed proof doesn't leave 0.0025 SOL stranded.
 */
export async function createPayLink(
  session: RingSession,
  asset: RingAssetId,
  amount: bigint,
  note?: string,
  onStep?: (s: PayLinkStep) => void,
) {
  const rt = await getRingRuntime();
  checkSpendable(rt, session, asset, amount);
  const link = createRingLinkSecret();
  const ephKeypair = rt.spr.ShieldedKeypair.fromKeypair(rt.spr.SigningKey.fromEd25519Bytes(new Uint8Array(link.seed) as never));
  link.seed.fill(0);
  const stored: StoredRingLink = {
    address: link.address,
    secret: link.secret,
    asset,
    amount: amount.toString(),
    createdAt: Date.now(),
    status: "funding",
    ...(note ? { note } : {}),
  };
  saveRingLink(stored);
  onStep?.("saved");
  try {
    onStep?.("prove");
    const tx = await rt.spr.buildTransferTransaction({
      client: rt.client,
      wallet: session.wallet,
      keys: session.keys,
      feePayer: session.owner,
      recipient: ephKeypair.shieldedAddress(),
      amount,
      ...(asset === "USDC" ? { asset: mintFor(rt, "USDC") } : {}),
    });
    onStep?.("fee");
    await transferSolPublic(session.signer, link.address as Address, RING_LINK_FEE_LAMPORTS);
    onStep?.("transfer");
    const sent = await submit(tx, [session.signer]);
    saveRingLink({ ...stored, status: "ready" });
    return { url: ringLinkUrl(link.address, link.secret, origin()), address: link.address, ...sent };
  } catch (e) {
    const recovered = await refreshPayLinkStatus(stored);
    if (recovered.status === "ready") {
      return { url: ringLinkUrl(link.address, link.secret, origin()), address: link.address, signature: "", slot: BigInt(0) };
    }
    throw e;
  }
}

/**
 * Finish or recover a pay link that was saved as "funding" (fee sent, proof
 * timed out, or confirmation dropped). Inspects the link first so we never
 * double-pay if the private transfer actually landed.
 */
export async function resumePayLink(session: RingSession, link: StoredRingLink, onStep?: (s: PayLinkStep) => void) {
  const current = await refreshPayLinkStatus(link);
  const url = ringLinkUrl(current.address, current.secret, origin());
  if (current.status === "ready") return { url, address: current.address, signature: "", slot: BigInt(0) };

  const rt = await getRingRuntime();
  const amount = expectedAmountOf(current.amount);
  let ephemeral: RingSession | null = null;
  try {
    ephemeral = await openStoredLinkSession(current.secret);
    const contents = await inspectPayLink(ephemeral);
    const privateAmount = contents.assets[current.asset]?.amount ?? BigInt(0);
    const kind = classifyPayLinkFunding({
      publicLamports: contents.publicLamports,
      privateAmount,
      expectedAmount: amount,
    });
    if (kind === "funded") {
      saveRingLink({ ...current, status: "ready" });
      return { url, address: current.address, signature: "", slot: BigInt(0) };
    }
    const remaining = amount > privateAmount ? amount - privateAmount : amount;
    if (remaining <= BigInt(0)) {
      saveRingLink({ ...current, status: "ready" });
      return { url, address: current.address, signature: "", slot: BigInt(0) };
    }
    checkSpendable(rt, session, current.asset, remaining);
    if (kind === "empty") {
      onStep?.("fee");
      await transferSolPublic(session.signer, current.address as Address, RING_LINK_FEE_LAMPORTS);
    }
    onStep?.("prove");
    const tx = await rt.spr.buildTransferTransaction({
      client: rt.client,
      wallet: session.wallet,
      keys: session.keys,
      feePayer: session.owner,
      recipient: ephemeral.address,
      amount: remaining,
      ...(current.asset === "USDC" ? { asset: mintFor(rt, "USDC") } : {}),
    });
    onStep?.("transfer");
    const sent = await submit(tx, [session.signer]);
    saveRingLink({ ...current, status: "ready" });
    return { url, address: current.address, ...sent };
  } catch (e) {
    const recovered = await refreshPayLinkStatus(current);
    if (recovered.status === "ready") return { url, address: current.address, signature: "", slot: BigInt(0) };
    throw e;
  } finally {
    destroyRingSession(ephemeral);
  }
}

export type PayLinkContents = {
  publicLamports: bigint;
  assets: Record<RingAssetId, RingAssetView>;
  empty: boolean;
};

export async function inspectPayLink(link: RingSession): Promise<PayLinkContents> {
  const rt = await getRingRuntime();
  await syncRing(link);
  await ensureKnownAssets(rt, link);
  const { lamports } = await publicBalances(link.owner);
  const assets = { SOL: assetView(rt, link, "SOL"), USDC: assetView(rt, link, "USDC") };
  return { publicLamports: lamports, assets, empty: assets.SOL.amount === BigInt(0) && assets.USDC.amount === BigInt(0) };
}

export type ClaimStep = "register" | "transfer" | "sweep" | "merging";

/**
 * Claim a pay link into the recipient's PRIVATE balance:
 *  1. register the recipient on the Default Ring if needed (link wallet pays rent + fee),
 *  2. private transfer of each asset from the link wallet to the recipient (amount hidden),
 *  3. sweep the link wallet's leftover public SOL to the recipient (closes it),
 *  4. best effort: turn on merging for the recipient.
 * Registration happens first, so the transfer can never fall back to a public withdrawal.
 */
export async function claimPayLink(
  link: RingSession,
  recipient: RingSession,
  onStep?: (s: ClaimStep) => void,
): Promise<{ signatures: string[]; slot: bigint }> {
  const rt = await getRingRuntime();
  const signatures: string[] = [];
  let slot = BigInt(0);
  onStep?.("register");
  const reg = await rt.spr.buildRegistrationTransaction({
    client: rt.client,
    owner: recipient.owner,
    address: recipient.address,
    payer: link.owner,
  });
  if (reg) {
    const r = await submit(reg, [recipient.signer, link.signer]);
    signatures.push(r.signature);
    slot = r.slot;
  }
  if (!(await isRingRegistered(recipient.owner))) {
    throw new Error("Registration didn't land, so nothing was moved. Try again.");
  }
  onStep?.("transfer");
  await syncRing(link);
  for (const id of ["SOL", "USDC"] as const) {
    const v = assetView(rt, link, id);
    if (v.amount === BigInt(0)) continue;
    const tx = await rt.spr.buildTransferTransaction({
      client: rt.client,
      wallet: link.wallet,
      keys: link.keys,
      feePayer: link.owner,
      recipient: recipient.owner,
      amount: v.amount,
      ...(id === "USDC" ? { asset: mintFor(rt, "USDC") } : {}),
    });
    const r = await submit(tx, [link.signer]);
    signatures.push(r.signature);
    slot = r.slot;
    await syncRing(link, r.slot);
  }
  onStep?.("sweep");
  const { lamports } = await publicBalances(link.owner);
  if (lamports > RING_SIGNATURE_FEE_LAMPORTS) {
    const r = await transferSolPublic(link.signer, recipient.owner, lamports - RING_SIGNATURE_FEE_LAMPORTS);
    signatures.push(r.signature);
  }
  onStep?.("merging");
  try {
    await enableMerging(recipient);
  } catch {
    /* optional; /ring offers it again */
  }
  return { signatures, slot };
}

export function destroyRingSession(s: RingSession | null) {
  try {
    s?.keys.destroy();
  } catch {
    /* ignore */
  }
}
