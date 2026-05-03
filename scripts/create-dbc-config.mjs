#!/usr/bin/env node
/**
 * Create a Meteora DBC partner config matching the sol.new memecoin recipe.
 *
 * Recipe (locked in 2026-05-03):
 *   1B supply · 6.9% creator locked w/ 69-day linear vest · ~30 SOL initial MC
 *   · ~69 SOL graduation · 0.69 SOL migration fee · DAMM v2 · 1% swap fees
 *   to platform fee vault
 *
 * Usage:
 *   PARTNER_PRIVATE_KEY='[1,2,...]' node scripts/create-dbc-config.mjs --dry-run
 *   PARTNER_PRIVATE_KEY='[1,2,...]' node scripts/create-dbc-config.mjs --send
 *
 * Required env:
 *   PARTNER_PRIVATE_KEY   JSON array (Solana CLI keypair) — pays + signs.
 *                         Funds need to cover ~2-5 SOL one-time setup.
 *   HELIUS_API_KEY        Helius mainnet RPC key (used in .env.local already).
 *
 * Optional:
 *   FEE_VAULT             Override the default fee vault address.
 *   RPC_URL               Override Helius URL.
 */

import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  MigrationOption,
  MigrationFeeOption,
  TokenDecimal,
  TokenType,
  TokenUpdateAuthorityOption,
  DammV2DynamicFeeMode,
  buildCurveWithMarketCap,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

// ─── recipe ──────────────────────────────────────────────────────────────────
// MCs are denominated in the QUOTE token (SOL). At ~$84/SOL:
//   30 SOL initial MC ≈ $2,520     (close to pump.fun's ~30 SOL initial)
//   migration MC tuned so the curve collects ~69 SOL by graduation
const RECIPE = {
  totalTokenSupply: 1_000_000_000,
  decimals: TokenDecimal.SIX,
  initialMarketCap: 30,         // SOL — pump-style starting MC
  migrationMarketCap: 318,      // SOL — empirically tuned for ~69 SOL graduation
  graduationSolTarget: 69,      // documentation only; SDK derives the actual threshold
  creatorLockedAmount: 69_000_000,
  creatorVestDays: 69,
  creatorVestPeriods: 69,
  swapFeeBps: 100,
  migrationFeePercent: 1,       // 1% of graduation quote (~69 SOL × 1% ≈ 0.69 SOL)
  migratedPoolFeeBps: 100,
};

const FEE_VAULT = new PublicKey(
  process.env.FEE_VAULT || "nEWKinAMMZv3zyHKSaLLyWsw6JBdbpES8ktgRnf6Tzf"
);
const NATIVE_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const RPC_URL =
  process.env.RPC_URL ||
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// ─── parse args ──────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run") || !args.has("--send");

if (!process.env.PARTNER_PRIVATE_KEY) {
  console.error("✘ PARTNER_PRIVATE_KEY env var is required");
  process.exit(1);
}
if (!process.env.HELIUS_API_KEY && !process.env.RPC_URL) {
  console.error("✘ HELIUS_API_KEY (or RPC_URL) env var is required");
  process.exit(1);
}

const partnerKey = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.PARTNER_PRIVATE_KEY))
);
console.log("partner wallet:", partnerKey.publicKey.toBase58());
console.log("fee vault     :", FEE_VAULT.toBase58());
console.log("rpc           :", RPC_URL.replace(/api-key=[^&]+/, "api-key=***"));
console.log("mode          :", DRY ? "DRY RUN (no tx)" : "SEND");
console.log();

// ─── build curve params (v1.5.7 nested API) ──────────────────────────────────
const curveParams = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPL,
    tokenBaseDecimal: RECIPE.decimals,
    tokenQuoteDecimal: TokenDecimal.NINE,
    tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
    totalTokenSupply: RECIPE.totalTokenSupply,
    leftover: 0,
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: {
        startingFeeBps: RECIPE.swapFeeBps,
        endingFeeBps: RECIPE.swapFeeBps,
        numberOfPeriod: 0,
        totalDuration: 0,
      },
    },
    dynamicFeeEnabled: false,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: 0,
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: false,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationFeeOption: MigrationFeeOption.Customizable,
    migrationFee: {
      feePercentage: RECIPE.migrationFeePercent,
      creatorFeePercentage: 0,
    },
    migratedPoolFee: {
      collectFeeMode: CollectFeeMode.QuoteToken,
      dynamicFee: DammV2DynamicFeeMode.Disabled,
      poolFeeBps: RECIPE.migratedPoolFeeBps,
    },
  },
  liquidityDistribution: {
    partnerPermanentLockedLiquidityPercentage: 100,
    partnerLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 0,
    creatorLiquidityPercentage: 0,
  },
  lockedVesting: {
    totalLockedVestingAmount: RECIPE.creatorLockedAmount,
    numberOfVestingPeriod: RECIPE.creatorVestPeriods,
    cliffUnlockAmount: 0,
    totalVestingDuration: RECIPE.creatorVestDays * 24 * 60 * 60,
    cliffDurationFromMigrationTime: 0,
  },
  activationType: ActivationType.Slot,
  initialMarketCap: RECIPE.initialMarketCap,
  migrationMarketCap: RECIPE.migrationMarketCap,
});

const lamports = (bn) => Number(bn?.toString?.() ?? bn) / 1_000_000_000;
console.log("curve summary:");
console.log("  total supply           :", RECIPE.totalTokenSupply.toLocaleString());
console.log("  creator locked         :", RECIPE.creatorLockedAmount.toLocaleString(), "(6.9%)");
console.log("  creator vest           :", `${RECIPE.creatorVestDays} days linear, no cliff`);
console.log("  initial MC             :", `${RECIPE.initialMarketCap} SOL`);
console.log("  migration MC (target)  :", `${RECIPE.migrationMarketCap} SOL`);
if (curveParams.migrationQuoteThreshold) {
  console.log("  graduation threshold   :", `${lamports(curveParams.migrationQuoteThreshold).toFixed(4)} SOL`);
}
console.log("  swap fee               :", `${RECIPE.swapFeeBps / 100}% → fee vault`);
console.log("  migration fee          :", `${RECIPE.migrationFeePercent}% of graduation`);
console.log("  post-graduation pool   :", `DAMM v2, ${RECIPE.migratedPoolFeeBps / 100}% fee`);
console.log();

if (DRY) {
  console.log("✓ Dry run: built curve params, validated. Re-run with --send to publish.");
  process.exit(0);
}

// ─── send tx ─────────────────────────────────────────────────────────────────
const connection = new Connection(RPC_URL, "confirmed");
const client = new DynamicBondingCurveClient(connection, "confirmed");
const configKey = Keypair.generate();

const balance = await connection.getBalance(partnerKey.publicKey);
console.log(`partner balance: ${(balance / 1e9).toFixed(4)} SOL`);
if (balance < 2e9) {
  console.error("✘ partner wallet needs ~2 SOL minimum to fund config creation");
  process.exit(1);
}

const tx = await client.partner.createConfig({
  config: configKey.publicKey,
  feeClaimer: FEE_VAULT,
  leftoverReceiver: FEE_VAULT,
  quoteMint: NATIVE_SOL,
  payer: partnerKey.publicKey,
  ...curveParams,
});

const sig = await sendAndConfirmTransaction(connection, tx, [partnerKey, configKey], {
  commitment: "confirmed",
  skipPreflight: false,
});

console.log();
console.log("✓ config created");
console.log("  signature  :", sig);
console.log("  config key :", configKey.publicKey.toBase58());
console.log();
console.log("Next: replace DBC_PARTNER_CONFIG in src/app/token/page.tsx:20 with:");
console.log(`  new PublicKey("${configKey.publicKey.toBase58()}")`);
