/**
 * Raydium LaunchLab create (browser only).
 * Dynamic-import the SDK so the Cloudflare Worker never packs it.
 * Vanity mint secrets never leave the Worker. Client sends unsigned txs to /api/stonk/sign-mint.
 */
"use client";

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";

export async function createLaunchLabTx(opts: {
  connection: Connection;
  owner: Keypair;
  name: string;
  symbol: string;
  uri: string;
  mint?: Keypair;
  mintPubkey?: string;
  configId?: string;
  platformId?: string;
  raiseRaw?: string;
}): Promise<{ mint: string; signature: string }> {
  const spec = "@" + "raydium-io/raydium-sdk-v2";
  const sdk = await import(/* webpackIgnore: true */ spec);
  const { Raydium, TxVersion, LAUNCHPAD_PROGRAM, LAUNCHPAD_CONFIG } = sdk;
  const mint =
    opts.mint || Keypair.generate();
  const mintPk = opts.mintPubkey ? new PublicKey(opts.mintPubkey) : mint.publicKey;
  const raydium = await Raydium.load({
    owner: opts.owner,
    connection: opts.connection,
    cluster: "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "confirmed",
  });

  const extra: Record<string, unknown> = {};
  if (opts.raiseRaw) extra.totalFundRaisingB = new BN(opts.raiseRaw);

  const built = await raydium.launchpad.createLaunchpad({
    programId: LAUNCHPAD_PROGRAM,
    mintA: mintPk,
    decimals: 6,
    name: opts.name,
    symbol: opts.symbol,
    uri: opts.uri,
    migrateType: "cpmm",
    configId: opts.configId ? new PublicKey(opts.configId) : LAUNCHPAD_CONFIG,
    ...(opts.platformId ? { platformId: new PublicKey(opts.platformId) } : {}),
    txVersion: TxVersion.LEGACY,
    buyAmount: new BN(0),
    createOnly: true,
    extraSigners: opts.mintPubkey ? [] : [mint],
    ...extra,
  });

  if (opts.mintPubkey) {
    const raw = (built.transactions as Transaction[]).map((tx) =>
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
    );
    const res = await fetch("/api/stonk/sign-mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: opts.mintPubkey, transactions: raw }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; transactions?: string[] };
    if (!json.ok || !json.transactions?.length) throw new Error(json.error || "Mint sign failed");
    let signature = "";
    for (const b64 of json.transactions) {
      const tx = Transaction.from(Buffer.from(b64, "base64"));
      tx.partialSign(opts.owner);
      signature = await opts.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    }
    if (!signature) throw new Error("LaunchLab sent no signature");
    return { mint: opts.mintPubkey, signature };
  }

  const { txIds } = await built.execute({ sequentially: true });
  const signature = txIds[0];
  if (!signature) throw new Error("LaunchLab sent no signature");
  return { mint: mint.publicKey.toBase58(), signature };
}
