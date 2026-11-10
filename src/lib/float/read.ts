import { Connection, PublicKey } from "@solana/web3.js";
import { decodeConfig, decodeQuoteAsset, decodeTickerRecord, type FloatConfig, type QuoteAssetAccount, type TickerRecord } from "./codec";
import { configPda, quoteAssetPda, tickerPda } from "./pdas";

export type LaunchChainState = {
  config: FloatConfig;
  quote: QuoteAssetAccount;
  ticker: TickerRecord | null;
  quoteTokenProgram: PublicKey;
};

/** Fresh config, quote asset, and ticker record. Used at submit time. */
export async function readLaunchChainState(
  connection: Connection,
  quoteMint: PublicKey,
  ticker: string,
): Promise<LaunchChainState> {
  const infos = await connection.getMultipleAccountsInfo([
    configPda(),
    quoteAssetPda(quoteMint),
    tickerPda(ticker),
    quoteMint,
  ]);
  if (!infos[0]) throw new Error("Float config account is missing on this network.");
  if (!infos[1]) throw new Error("That quote token is not listed on Float.");
  if (!infos[3]) throw new Error("Quote mint account is missing.");
  return {
    config: decodeConfig(infos[0].data),
    quote: decodeQuoteAsset(infos[1].data),
    ticker: infos[2] ? decodeTickerRecord(infos[2].data) : null,
    quoteTokenProgram: infos[3].owner,
  };
}
