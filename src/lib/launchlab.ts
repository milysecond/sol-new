/**
 * Raydium LaunchLab create (browser only).
 * Dynamic-import the SDK so the Cloudflare Worker never packs it.
 */
"use client";

import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";

export async function createLaunchLabTx(opts: {
  connection: Connection;
  owner: Keypair;
  name: string;
  symbol: string;
  uri: string;
}): Promise<{ mint: string; signature: string }> {
  const spec = "@" + "raydium-io/raydium-sdk-v2";
  const sdk = await import(/* webpackIgnore: true */ spec);
  const { Raydium, TxVersion, LAUNCHPAD_PROGRAM, LAUNCHPAD_CONFIG } = sdk;
  const mint = Keypair.generate();
  const raydium = await Raydium.load({
    owner: opts.owner,
    connection: opts.connection,
    cluster: "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "confirmed",
  });

  const built = await raydium.launchpad.createLaunchpad({
    programId: LAUNCHPAD_PROGRAM,
    mintA: mint.publicKey,
    decimals: 6,
    name: opts.name,
    symbol: opts.symbol,
    uri: opts.uri,
    migrateType: "cpmm",
    configId: LAUNCHPAD_CONFIG,
    txVersion: TxVersion.LEGACY,
    buyAmount: new BN(0),
    createOnly: true,
    extraSigners: [mint],
  });

  const { txIds } = await built.execute({ sequentially: true });
  const signature = txIds[0];
  if (!signature) throw new Error("LaunchLab sent no signature");
  return { mint: mint.publicKey.toBase58(), signature };
}
