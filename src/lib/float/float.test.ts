import assert from "node:assert/strict";
import { test } from "node:test";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { LAUNCH_DISCRIMINATOR, LAUNCHLAB_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "./constants";
import { readI64LE, readU64LE, u64le } from "./bytes";
import { decodeConfig, decodeQuoteAsset, decodeTickerRecord } from "./codec";
import { explainFloatError } from "./errors";
import { buildLaunchInstruction, encodeLaunchData } from "./instruction";
import { coinMintPda, configPda, launchlabAuthority, launchlabPlatformPda, quoteAssetPda } from "./pdas";
import { formatFeePercent, quoteTakeover, solStringToLamports } from "./takeover";
import { metadataUriError, nameError, tickerError } from "./validate";

const CREATOR = new PublicKey("AySEWGvxwJn7mJLTjGeGG4G1NfFbKfgXQezWtt4aPN1x");
const QUOTE = new PublicKey("Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ");
const COIN = new PublicKey("4aHLHiAqrKA5CV3isUiX7JC7C4HcWdjC322KPWVfLoat");
const TREASURY = new PublicKey("2LMWFmbGBfw78ZEas2NFmAYfo4bhyBqYboYh9nk3mDFQ");
const GLOBAL = new PublicKey("83KjqrTThSwY5dL1nDAf3Mi8eM9nZi33yM8Ntx2aJYuE");
const FEE_RECV = new PublicKey("9fnyojTv8GYHWr4Vaj4tvVL82scPPYYkW1CAXAbfUsdj");
const URI =
  "https://float.mypinata.cloud/ipfs/bafkreiaussus2zfbnidsa6vsmbzz4kznho2borbmlslq3tnf2vf7er5sjq";

const KNOWN_DATA =
  "1022baa4b3e3657e0e000000546f7020466c6f6f7220426f737303000000544a525d00000068747470733a2f2f666c6f61742e6d7970696e6174612e636c6f75642f697066732f6261666b726569617573737573327a66626e696473613676736d627a7a346b7a6e686f32626f72626d6c736c7133746e6632766637657235736a7180cd8e2428fbc2e9426aea678e99be9bd1f247c46fe109cbb6cd1c67953c5d72000000000000000000";

const KNOWN_ACCOUNTS = [
  "AySEWGvxwJn7mJLTjGeGG4G1NfFbKfgXQezWtt4aPN1x",
  "AgaKFP4SfEeeM4r4GcSWBwpEAbfHh7wLkJGHqpWrLBQV",
  "2LMWFmbGBfw78ZEas2NFmAYfo4bhyBqYboYh9nk3mDFQ",
  "ED8X6LNdvhyxJ6ZrN6g3keTzGKUcrZvjgFnh4X76VhQu",
  "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
  "AToGz2eMAUx9kavkG9yXCpLbmodh7zC47AjG82x4i8VX",
  "4aHLHiAqrKA5CV3isUiX7JC7C4HcWdjC322KPWVfLoat",
  "13v93vAeC8CDhwkioCJwTdGhcDKw8zeKVhXRZ6MAXCz",
  "9Am1dr4YxPTtQ4RtVw94XcGa89ftNof1AYVK5KmZNDgb",
  "83KjqrTThSwY5dL1nDAf3Mi8eM9nZi33yM8Ntx2aJYuE",
  "2TDPJJPV6nvTEqXABxrqno6Uzpipxxvh1zjLN3SMYn69",
  "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh",
  "B8A8ZZdCv3zFRqndLm6WU1ZXgqV4tUXcdYbUqoKLusmg",
  "35EnShH75gFQVsRh1Z2mqgJvE6KDpfwpmxxjxS1utR8C",
  "5G98ABRNGJCqXKALJPZrRELspGuQ9TzGm2D6MfjfrUn3",
  "HpF4nUvqzZBYWQnRjMH848waCX7gRLUpRaKc7NaTy9qe",
  "2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr",
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "11111111111111111111111111111111",
  "SysvarRent111111111111111111111111111111111",
];

function knownInput(extra: Partial<Parameters<typeof buildLaunchInstruction>[0]> = {}) {
  return {
    creator: CREATOR,
    treasury: TREASURY,
    quoteMint: QUOTE,
    quoteTokenProgram: TOKEN_2022_PROGRAM_ID,
    globalConfig: GLOBAL,
    name: "Top Floor Boss",
    ticker: "TJR",
    uri: URI,
    feeReceiver: FEE_RECV,
    feeTier: 0,
    mintNonce: BigInt(0),
    coinMint: COIN,
    keyed: true,
    maxTakeoverLamports: null,
    ...extra,
  };
}

test("launch_keyed matches a real mainnet Float transaction", () => {
  const ix = buildLaunchInstruction(knownInput());
  assert.equal(Buffer.from(ix.data).toString("hex"), KNOWN_DATA);
  assert.deepEqual(
    ix.keys.map((k) => k.pubkey.toBase58()),
    KNOWN_ACCOUNTS,
  );
  assert.equal(ix.keys[0].isSigner, true);
  assert.equal(ix.keys[6].isSigner, true);
  assert.equal(ix.programId.toBase58(), "3KguFi7YYzLgttG46fRism16CfcuNCkDh6U7td9JTqxX");
  assert.equal(ix.keys[17].pubkey.toBase58(), LAUNCHLAB_PROGRAM_ID.toBase58());
});

test("uppercase ticker still hits the same ticker PDA", () => {
  const lower = buildLaunchInstruction(knownInput({ ticker: "tjr" }));
  const upper = buildLaunchInstruction(knownInput({ ticker: "TJR" }));
  assert.equal(lower.keys[5].pubkey.toBase58(), upper.keys[5].pubkey.toBase58());
  assert.notEqual(Buffer.from(lower.data).toString("hex"), Buffer.from(upper.data).toString("hex"));
});

test("launch uses the PDA mint and is not a keyed signer", () => {
  const creator = Keypair.generate().publicKey;
  const nonce = BigInt(42);
  const mint = coinMintPda(creator, nonce);
  const ix = buildLaunchInstruction(
    knownInput({
      creator,
      coinMint: mint,
      keyed: false,
      mintNonce: nonce,
      ticker: "PEPE",
      maxTakeoverLamports: BigInt(0),
    }),
  );
  assert.equal(Buffer.from(ix.data.subarray(0, 8)).equals(LAUNCH_DISCRIMINATOR), true);
  assert.equal(ix.keys[6].isSigner, false);
  assert.equal(ix.keys[6].pubkey.toBase58(), mint.toBase58());
  const withCap = encodeLaunchData(
    knownInput({ maxTakeoverLamports: BigInt(2_000_000_000) }),
  );
  const without = encodeLaunchData(knownInput({ maxTakeoverLamports: null }));
  assert.equal(withCap.length, without.length + 8);
  assert.equal(withCap.subarray(withCap.length - 8).readBigUInt64LE(0), BigInt(2_000_000_000));
});

test("platform and authority PDAs match live Float config", () => {
  assert.equal(configPda().toBase58(), "AgaKFP4SfEeeM4r4GcSWBwpEAbfHh7wLkJGHqpWrLBQV");
  assert.equal(
    launchlabPlatformPda(0).toBase58(),
    "2TDPJJPV6nvTEqXABxrqno6Uzpipxxvh1zjLN3SMYn69",
  );
  assert.equal(
    launchlabPlatformPda(1).toBase58(),
    "7paQR4MLZcGdG8ZYAyj9Qu2UsJgXmNVQGha7g1gim1sG",
  );
  assert.equal(
    launchlabPlatformPda(2).toBase58(),
    "CKpEUk5SRk8CUNhhxaVPKtzKUKLgQe2tQHPH2eXWtaGR",
  );
  assert.equal(launchlabAuthority().toBase58(), "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh");
});

test("fee percents include Raydium's 0.25%", () => {
  assert.equal(formatFeePercent(BigInt(7500)), "1%");
  assert.equal(formatFeePercent(BigInt(17500)), "2%");
  assert.equal(formatFeePercent(BigInt(22500)), "2.5%");
});

test("takeover price steps down with ticker age", () => {
  const config = { tickerTakeoverLamports: BigInt(2_000_000_000), tickerProtectSecs: BigInt(0) };
  const ticker = {
    coinMint: COIN,
    creator: CREATOR,
    claimedAt: BigInt(1_000),
    takeovers: 0,
  };
  assert.equal(quoteTakeover({ config, ticker: null, nowSecs: 1000 }).free, true);
  assert.equal(quoteTakeover({ config, ticker, nowSecs: 1010 }).lamports, BigInt(5_000_000_000));
  assert.equal(quoteTakeover({ config, ticker, nowSecs: 1030 }).lamports, BigInt(4_000_000_000));
  assert.equal(quoteTakeover({ config, ticker, nowSecs: 2000 }).lamports, BigInt(3_000_000_000));
  assert.equal(quoteTakeover({ config, ticker, nowSecs: 5000 }).lamports, BigInt(2_000_000_000));
  const protectedCfg = { ...config, tickerProtectSecs: BigInt(3600) };
  assert.equal(quoteTakeover({ config: protectedCfg, ticker, nowSecs: 1100 }).protected, true);
});

test("ticker, name, and uri checks", () => {
  assert.equal(tickerError("PEPE"), null);
  assert.match(tickerError("TOO-LONG!!") || "", /1–10/);
  assert.match(tickerError("bad_sym") || "", /letters or digits/);
  assert.match(nameError("x".repeat(33)) || "", /32/);
  assert.equal(metadataUriError("https://sol.new/metadata/ab.json"), null);
  assert.match(metadataUriError("ipfs://abc") || "", /https/);
  assert.equal(solStringToLamports("2"), BigInt(2_000_000_000));
  assert.equal(solStringToLamports("0.5"), BigInt(500_000_000));
  assert.equal(solStringToLamports("nope"), null);
});

test("ticker bytes decode and u64 helpers round-trip", () => {
  const raw = Buffer.from(
    "Yh67og/RzeP2t/6vtXy9FZ0u1ySrFI6wXLmtwqBl08Z3dpcL35xNHA5q2X65/tkGzSBIESXPuFvo3yhnM1YVIp/JzqWKhLVFqRjyagAAAAAHAAAA/A==",
    "base64",
  );
  const rec = decodeTickerRecord(raw);
  assert.equal(rec.coinMint.toBase58(), "Hc6295k1Cu9emcLYzMZNZHoqg87CqKXkpPvBMjramk9q");
  assert.equal(rec.creator.toBase58(), "yHCxHBEaJW5tbndqC8JciSThr7U1cqLpdcsvHcx6PRe");
  assert.equal(rec.claimedAt, BigInt(1794250921));
  assert.equal(rec.takeovers, 7);
  assert.equal(readU64LE(u64le(rec.claimedAt), 0), rec.claimedAt);
  assert.equal(readI64LE(u64le(BigInt(-1)), 0), BigInt(-1));
  assert.equal(readU64LE(u64le(BigInt(2_000_000_000)), 0), BigInt(2_000_000_000));
});

test("program errors become plain language", () => {
  assert.match(explainFloatError("Error Number: 6005. LaunchesPaused"), /paused/i);
  assert.match(explainFloatError("custom program error: 0x1776"), /turned off|disabled/i);
  assert.match(explainFloatError('{"Custom":6039}'), /takeover/i);
  assert.match(explainFloatError("QuoteDisabled"), /turned off|disabled/i);
});

test("live config still decodes and a launch simulates", { skip: !process.env.FLOAT_SIM }, async () => {
  const conn = new Connection("https://viviyan-bkj12u-fast-mainnet.helius-rpc.com", "confirmed");
  const info = await conn.getAccountInfo(configPda());
  assert.ok(info);
  const cfg = decodeConfig(info.data);
  assert.equal(cfg.launchesPaused, false);
  assert.equal(cfg.tierCount, 3);
  assert.equal(formatFeePercent(cfg.tierFeeRates[0]), "1%");

  const payer = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  const quoteMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const quoteInfo = await conn.getAccountInfo(quoteAssetPda(quoteMint));
  assert.ok(quoteInfo, "USDC quote asset");
  const quote = decodeQuoteAsset(quoteInfo.data);
  assert.equal(quote.enabled, true);

  const nonce = BigInt(Date.now());
  const mint = coinMintPda(payer, nonce);
  const ticker = `Z${(Date.now() % 1_000_000_000).toString(36)}`.slice(0, 10).toUpperCase();
  const ix = buildLaunchInstruction({
    creator: payer,
    treasury: cfg.treasury,
    quoteMint,
    quoteTokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    globalConfig: quote.globalConfig,
    platformConfig: cfg.platforms[0],
    name: "Sim Coin",
    ticker,
    uri: "https://sol.new/metadata/sim.json",
    feeReceiver: payer,
    feeTier: 0,
    mintNonce: nonce,
    coinMint: mint,
    keyed: false,
    maxTakeoverLamports: BigInt(0),
  });
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ix,
  );
  const sim = await conn.simulateTransaction(tx);
  const logs = (sim.value.logs || []).join("\n");
  if (sim.value.err) {
    console.error(logs);
    console.error(JSON.stringify(sim.value.err));
  }
  assert.equal(sim.value.err, null, logs.slice(-800));
  assert.match(logs, /Instruction: Launch/);
});
