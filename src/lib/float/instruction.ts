import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  FLOAT_PROGRAM_ID,
  LAUNCH_DISCRIMINATOR,
  LAUNCH_KEYED_DISCRIMINATOR,
  LAUNCHLAB_PROGRAM_ID,
  METADATA_PROGRAM_ID,
  RENT_SYSVAR,
  TOKEN_PROGRAM_ID,
  VANITY_SUFFIX,
} from "./constants";
import {
  coinVaultPda,
  configPda,
  launchPda,
  launchlabAuthority,
  launchlabEventAuthority,
  launchlabPlatformPda,
  metadataPda,
  poolPda,
  poolVaultPda,
  quoteAssetPda,
  tickerPda,
  u64le,
} from "./pdas";

export type LaunchIxInput = {
  creator: PublicKey;
  treasury: PublicKey;
  quoteMint: PublicKey;
  /** Mint account owner: Token or Token-2022. */
  quoteTokenProgram: PublicKey;
  /** QuoteAsset.global_config — the LaunchLab curve config for this quote. */
  globalConfig: PublicKey;
  /**
   * LaunchLab platform for the chosen tier.
   * Defaults to the PDA derived from Float's platform seed for `feeTier`.
   */
  platformConfig?: PublicKey;
  name: string;
  /** Stored in the creator's case. The ticker PDA uses the uppercase form. */
  ticker: string;
  uri: string;
  feeReceiver: PublicKey;
  feeTier: number;
  /** Ignored by `launch_keyed` (pass 0). Random u64 for `launch`. */
  mintNonce: bigint;
  coinMint: PublicKey;
  /** When true, build `launch_keyed` and mark the mint as a signer. */
  keyed: boolean;
  /**
   * Max SOL lamports this launch will pay to take over the ticker.
   * Omit to match older transactions that leave the field off (they accept any fee).
   */
  maxTakeoverLamports?: bigint | null;
};

function writeString(buf: Buffer[], value: string) {
  const bytes = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  buf.push(len, bytes);
}

export function encodeLaunchData(input: LaunchIxInput): Buffer {
  const parts: Buffer[] = [
    input.keyed ? LAUNCH_KEYED_DISCRIMINATOR : LAUNCH_DISCRIMINATOR,
  ];
  writeString(parts, input.name);
  writeString(parts, input.ticker);
  writeString(parts, input.uri);
  parts.push(Buffer.from(input.feeReceiver.toBytes()));
  parts.push(Buffer.from([input.feeTier]));
  parts.push(u64le(input.mintNonce));
  if (input.maxTakeoverLamports != null) {
    parts.push(u64le(input.maxTakeoverLamports));
  }
  return Buffer.concat(parts);
}

export function isVanityMint(mint: PublicKey): boolean {
  return mint.toBase58().endsWith(VANITY_SUFFIX);
}

export function buildLaunchInstruction(input: LaunchIxInput): TransactionInstruction {
  const pool = poolPda(input.coinMint, input.quoteMint);
  const platform = input.platformConfig ?? launchlabPlatformPda(input.feeTier);
  const keys = [
    { pubkey: input.creator, isSigner: true, isWritable: true },
    { pubkey: configPda(), isSigner: false, isWritable: false },
    { pubkey: input.treasury, isSigner: false, isWritable: true },
    { pubkey: quoteAssetPda(input.quoteMint), isSigner: false, isWritable: false },
    { pubkey: input.quoteMint, isSigner: false, isWritable: false },
    { pubkey: tickerPda(input.ticker), isSigner: false, isWritable: true },
    { pubkey: input.coinMint, isSigner: input.keyed, isWritable: true },
    { pubkey: launchPda(input.coinMint), isSigner: false, isWritable: true },
    { pubkey: coinVaultPda(input.coinMint), isSigner: false, isWritable: false },
    { pubkey: input.globalConfig, isSigner: false, isWritable: false },
    { pubkey: platform, isSigner: false, isWritable: false },
    { pubkey: launchlabAuthority(), isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: poolVaultPda(pool, input.coinMint), isSigner: false, isWritable: true },
    { pubkey: poolVaultPda(pool, input.quoteMint), isSigner: false, isWritable: true },
    { pubkey: metadataPda(input.coinMint), isSigner: false, isWritable: true },
    { pubkey: launchlabEventAuthority(), isSigner: false, isWritable: false },
    { pubkey: LAUNCHLAB_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: input.quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: FLOAT_PROGRAM_ID,
    keys,
    data: encodeLaunchData(input),
  });
}
