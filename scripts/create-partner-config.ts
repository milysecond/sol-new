import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { buildCurveWithMarketCap, PoolService, BaseFeeMode, ActivationType } from "@meteora-ag/dynamic-bonding-curve-sdk";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const VAULT = new PublicKey("nEWKinAMMZv3zyHKSaLLyWsw6JBdbpES8ktgRnf6Tzf");

const so1 = Keypair.fromSecretKey(Uint8Array.from([219,153,6,13,177,170,240,198,226,216,46,25,60,207,179,78,123,47,52,12,236,65,141,220,209,49,9,37,252,232,153,32,6,155,140,226,169,91,38,156,220,31,71,183,234,119,157,15,23,152,55,219,60,155,40,210,78,130,249,102,142,28,106,192]));
const configKeypair = Keypair.fromSecretKey(Uint8Array.from(require("/Users/metasal/.credentials/solnew-partner-config.json")));

const network = process.argv[2] || "mainnet";
const rpc = network === "mainnet"
  ? "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com"
  : "https://api.devnet.solana.com";

async function main() {
  const connection = new Connection(rpc, "confirmed");
  
  console.log(`Network: ${network}`);
  console.log(`Config: ${configKeypair.publicKey.toBase58()}`);
  console.log(`Fee claimer: ${VAULT.toBase58()}`);

  const bal = await connection.getBalance(so1.publicKey);
  console.log(`Payer balance: ${bal / LAMPORTS_PER_SOL} SOL`);

  const configParams = buildCurveWithMarketCap({
    totalTokenSupply: 1_000_000_000,
    tokenType: 0, // SPL
    tokenBaseDecimal: 6,
    tokenQuoteDecimal: 9,
    tokenUpdateAuthority: 0, // CreatorOrPartner
    lockedVestingParams: {
      totalLockedVestingAmount: 0, numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0,
    },
    leftover: 0,
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: { startingFeeBps: 250, endingFeeBps: 100, numberOfPeriod: 600, totalDuration: 86400 },
    },
    dynamicFeeEnabled: false,
    activationType: ActivationType.Timestamp,
    collectFeeMode: 1, // OnlyQuote
    creatorTradingFeePercentage: 100,
    poolCreationFee: 0,
    migrationOption: 1, // MET_DAMM_V2
    migrationFeeOption: 3, // FixedBps100
    migrationFee: { feePercentage: 1, creatorFeePercentage: 100 },
    partnerPermanentLockedLiquidityPercentage: 0,
    partnerLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 100,
    creatorLiquidityPercentage: 0,
    enableFirstSwapWithMinFee: false,
    initialMarketCap: 1.5,  // ~$300 at $200/SOL
    migrationMarketCap: 3.75, // $750 at $200/SOL
  });

  console.log("Config params built");

  // Use program.methods directly (skip SDK validation which has a tokenSupply bug)
  const ps = new PoolService(connection, "confirmed");
  const tx = await ps.program.methods.createConfig(configParams).accountsPartial({
    config: configKeypair.publicKey,
    feeClaimer: VAULT,
    leftoverReceiver: VAULT,
    quoteMint: WRAPPED_SOL,
    payer: so1.publicKey,
  }).transaction();

  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = so1.publicKey;
  tx.sign(so1, configKeypair);

  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`TX: ${sig}`);
  await connection.confirmTransaction(sig);
  console.log(`Partner config created on ${network}!`);
}

main().catch(console.error);
