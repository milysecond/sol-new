// TxLINE (TXODDS on-chain oracle) integration for /punt.
//
// Free World Cup tier: an on-chain `subscribe` on their Solana program costs
// 0 TxL tokens (only network fees), and unlocks the off-chain data API for
// 4 weeks. This module self-bootstraps: on first use it subscribes with the
// fee payer wallet, activates an API token, persists auth in the metadata
// table, and re-subscribes automatically when the subscription lapses.
//
// Docs: https://txline.txodds.com/documentation · github.com/txodds/tx-on-chain

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getMetadata, saveMetadata, updateMetadata } from "./db";

const TXLINE_ORIGIN = "https://txline.txodds.com";
const API_BASE = `${TXLINE_ORIGIN}/api`;
const PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const TXL_MINT = new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL");
// From the txoracle IDL: instruction `subscribe(service_level_id: u16, weeks: u8)`
const SUBSCRIBE_DISCRIMINATOR = Uint8Array.from([254, 28, 191, 138, 156, 179, 183, 53]);
// Free tiers per docs: 12 = World Cup & friendlies real-time, 1 = 60s delay
const FREE_SERVICE_LEVELS = [12, 1];
const SUBSCRIPTION_WEEKS = 4;

const AUTH_META_ID = "txline-auth";

interface TxlineAuth {
  apiToken: string;
  jwt: string;
  jwtAt: number; // ms
  subscribedAt: number; // ms
  serviceLevel: number;
}

const JWT_TTL_MS = 25 * 24 * 3600 * 1000; // renew before the 30-day expiry
const SUBSCRIPTION_TTL_MS = (SUBSCRIPTION_WEEKS * 7 - 1) * 24 * 3600 * 1000; // renew a day early

function parseKeypair(secret: string): Keypair {
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  }
}

const MIN_LAMPORTS = 5_000_000; // ~0.005 SOL covers ATA rent + fees

// The subscriber wallet only pays network fees (the tier itself is free).
// Use whichever operational wallet actually holds SOL.
async function fundedSubscriber(connection: Connection): Promise<Keypair> {
  const candidates = [process.env.SOL_FEE_PAYER_SECRET, process.env.TREASURY_PRIVATE_KEY]
    .filter((s): s is string => !!s)
    .map(parseKeypair);
  if (!candidates.length) throw new Error("SOL_FEE_PAYER_SECRET not configured");

  const balances = await Promise.all(candidates.map((k) => connection.getBalance(k.publicKey, "confirmed")));
  const idx = balances.findIndex((b) => b >= MIN_LAMPORTS);
  if (idx === -1) {
    const detail = candidates.map((k, i) => `${k.publicKey.toBase58()} (${balances[i] / 1e9} SOL)`).join(", ");
    throw new Error(`No funded subscriber wallet — send ≥0.005 SOL to one of: ${detail}`);
  }
  return candidates[idx];
}

async function fetchGuestJwt(): Promise<string> {
  const r = await fetch(`${TXLINE_ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!r.ok) throw new Error(`TxLINE guest session failed: ${r.status}`);
  const j = (await r.json()) as { token: string };
  return j.token;
}

function subscribeInstruction(user: PublicKey, serviceLevelId: number, weeks: number): TransactionInstruction {
  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], PROGRAM_ID);
  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], PROGRAM_ID);
  const userTokenAccount = getAssociatedTokenAddressSync(TXL_MINT, user, false, TOKEN_2022_PROGRAM_ID);
  const treasuryVault = getAssociatedTokenAddressSync(TXL_MINT, treasuryPda, true, TOKEN_2022_PROGRAM_ID);

  const data = Buffer.alloc(11);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  data.writeUInt16LE(serviceLevelId, 8);
  data.writeUInt8(weeks, 10);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pricingMatrix, isSigner: false, isWritable: false },
      { pubkey: TXL_MINT, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: treasuryVault, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function subscribeOnChain(rpc: string, serviceLevelId: number, user: Keypair): Promise<string> {
  const connection = new Connection(rpc, "confirmed");
  const userTokenAccount = getAssociatedTokenAddressSync(TXL_MINT, user.publicKey, false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction().add(
    // Idempotent: no-op if the TxL token account already exists
    createAssociatedTokenAccountIdempotentInstruction(
      user.publicKey, userTokenAccount, user.publicKey, TXL_MINT,
      TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    subscribeInstruction(user.publicKey, serviceLevelId, SUBSCRIPTION_WEEKS)
  );
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = user.publicKey;
  tx.sign(user);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await pollConfirm(connection, sig);
  return sig;
}

// connection.confirmTransaction() subscribes over WebSocket, which hangs under
// Cloudflare Workers — poll signature status over HTTP instead.
async function pollConfirm(connection: Connection, signature: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Transaction ${signature} not confirmed within ${timeoutMs / 1000}s`);
}

async function activateToken(txSig: string, jwt: string, user: Keypair): Promise<string> {
  // Strict message binding required by TxLINE: txSig, leagues csv (empty), jwt
  const message = new TextEncoder().encode(`${txSig}::${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, user.secretKey)).toString("base64");

  const r = await fetch(`${API_BASE}/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues: [] }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`TxLINE activation failed (${r.status}): ${body.slice(0, 200)}`);
  // Response is either a bare token string or {"token": "..."}
  try {
    const j = JSON.parse(body) as { token?: string };
    return j.token || body;
  } catch {
    return body.replace(/^"|"$/g, "");
  }
}

async function loadAuth(): Promise<TxlineAuth | null> {
  try {
    const json = await getMetadata(AUTH_META_ID);
    return json ? (JSON.parse(json) as TxlineAuth) : null;
  } catch {
    return null;
  }
}

async function storeAuth(auth: TxlineAuth) {
  const json = JSON.stringify(auth);
  const updated = await updateMetadata(AUTH_META_ID, json);
  if (!updated) await saveMetadata(AUTH_META_ID, json);
}

async function bootstrap(rpc: string): Promise<TxlineAuth> {
  const jwt = await fetchGuestJwt();
  const user = await fundedSubscriber(new Connection(rpc, "confirmed"));
  let lastError: unknown;
  for (const level of FREE_SERVICE_LEVELS) {
    try {
      const txSig = await subscribeOnChain(rpc, level, user);
      const apiToken = await activateToken(txSig, jwt, user);
      const auth: TxlineAuth = { apiToken, jwt, jwtAt: Date.now(), subscribedAt: Date.now(), serviceLevel: level };
      await storeAuth(auth);
      return auth;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`TxLINE bootstrap failed: ${String(lastError)}`);
}

export async function getTxlineAuth(rpc: string): Promise<TxlineAuth> {
  let auth = await loadAuth();

  if (!auth || Date.now() - auth.subscribedAt > SUBSCRIPTION_TTL_MS) {
    return bootstrap(rpc);
  }
  // Guest JWTs expire after 30 days; refresh proactively (API token stays valid)
  if (Date.now() - auth.jwtAt > JWT_TTL_MS) {
    auth = { ...auth, jwt: await fetchGuestJwt(), jwtAt: Date.now() };
    await storeAuth(auth);
  }
  return auth;
}

/**
 * Authenticated GET against the TxLINE data API. On 401 refreshes the guest
 * JWT once; on 403 (lapsed subscription) re-bootstraps once.
 */
export async function txlineFetch<T>(rpc: string, path: string): Promise<T> {
  let auth = await getTxlineAuth(rpc);

  const doFetch = (a: TxlineAuth) =>
    fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${a.jwt}`, "X-Api-Token": a.apiToken },
    });

  let r = await doFetch(auth);
  if (r.status === 401) {
    auth = { ...auth, jwt: await fetchGuestJwt(), jwtAt: Date.now() };
    await storeAuth(auth);
    r = await doFetch(auth);
  }
  if (r.status === 403) {
    auth = await bootstrap(rpc);
    r = await doFetch(auth);
  }
  if (!r.ok) throw new Error(`TxLINE ${path} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

// ─── Data types (subset of the TxLINE OpenAPI schemas) ──────────────────────

export interface TxFixture {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
}

export interface TxOddsPayload {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  Bookmaker: string;
  BookmakerId: number;
  SuperOddsType: string;
  GameState?: string;
  InRunning: boolean;
  MarketParameters?: string;
  MarketPeriod?: string;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: string[];
}

// Score update events for a fixture. Statuses per the soccer feed docs:
// 5 = ended, 10 = ended after extra time, 13 = ended after penalties,
// 100 = post-match administrative event (may carry an empty Score).
export interface TxScoreParticipant {
  H1?: { Goals?: number };
  H2?: { Goals?: number };
  Total?: { Goals?: number };
}

export interface TxScoreEvent {
  FixtureId: number;
  Ts: number;
  StatusId?: number;
  Score?: {
    Participant1?: TxScoreParticipant;
    Participant2?: TxScoreParticipant;
  };
}

export const WORLD_CUP_COMPETITION_ID = 72;

export async function getFixtures(rpc: string, competitionId?: number): Promise<TxFixture[]> {
  const qs = competitionId ? `?competitionId=${competitionId}` : "";
  return txlineFetch<TxFixture[]>(rpc, `/fixtures/snapshot${qs}`);
}

export async function getOddsSnapshot(rpc: string, fixtureId: number): Promise<TxOddsPayload[]> {
  // Without asOf the endpoint only returns odds published in the current
  // 5-minute interval; asOf=now gives the latest cumulative snapshot.
  return txlineFetch<TxOddsPayload[]>(rpc, `/odds/snapshot/${fixtureId}?asOf=${Date.now()}`);
}

export async function getScoresSnapshot(rpc: string, fixtureId: number): Promise<TxScoreEvent[]> {
  return txlineFetch<TxScoreEvent[]>(rpc, `/scores/snapshot/${fixtureId}?asOf=${Date.now()}`);
}
