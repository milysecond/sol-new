import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssetBatch } from "@/lib/helius-das";
import { mainnetRpcUrl } from "@/lib/rpc-server";
import {
  FLOAT_PROGRAM_ID,
  QUOTE_DISCRIMINATOR,
  RAYDIUM_CURVE_FEE_UNITS,
} from "./constants";
import {
  decodeConfig,
  decodeQuoteAsset,
  mintDecimals,
  readMetadataNameSymbol,
  type FeeSplit,
} from "./codec";
import { configPda, metadataPda } from "./pdas";
import { formatFeePercent } from "./takeover";

export type FloatQuoteView = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: string;
  globalConfig: string;
  startFdv: string;
  image: string | null;
};

export type FloatTierView = {
  index: number;
  feeUnits: string;
  /** Trader-facing percent, including Raydium's 0.25%. */
  label: string;
  platform: string;
};

export type FloatCatalog = {
  launchesPaused: boolean;
  treasury: string;
  feeSplit: FeeSplit;
  /** Raydium curve fee in the same units as tier rates (10_000 = 1%). */
  raydiumFeeUnits: string;
  takeoverFlatLamports: string;
  protectSecs: string;
  tiers: FloatTierView[];
  quotes: FloatQuoteView[];
};

const TTL_MS = 45_000;
let cache: { at: number; body: FloatCatalog } | null = null;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function rank(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "SOL" || s === "WSOL") return 0;
  if (s === "USDC" || s === "USDT") return 1;
  // xStocks use a trailing lowercase x (AAPLx). Don't treat AVAX as one.
  if (/^[A-Za-z]{1,5}x$/.test(symbol)) return 2;
  return 3;
}

export async function loadFloatCatalog(): Promise<FloatCatalog> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.body;

  const connection = new Connection(mainnetRpcUrl(), "confirmed");
  const [cfgInfo, quoteAccounts] = await Promise.all([
    connection.getAccountInfo(configPda()),
    connection.getProgramAccounts(FLOAT_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ memcmp: { offset: 0, bytes: bs58.encode(QUOTE_DISCRIMINATOR) } }],
    }),
  ]);
  if (!cfgInfo) throw new Error("Float config account is missing.");
  const config = decodeConfig(cfgInfo.data);

  const decoded = quoteAccounts
    .map((row) => {
      try {
        return decodeQuoteAsset(row.account.data);
      } catch {
        return null;
      }
    })
    .filter((q): q is NonNullable<typeof q> => q != null && q.enabled);

  const mints = decoded.map((q) => q.mint);
  const mintInfos = new Map<string, { owner: string; decimals: number }>();
  const names = new Map<string, { name: string; symbol: string }>();

  for (const group of chunks(mints, 100)) {
    const infos = await connection.getMultipleAccountsInfo(group);
    infos.forEach((info, i) => {
      const mint = group[i];
      if (!info || !mint) return;
      const decimals = mintDecimals(info.data);
      if (decimals == null) return;
      mintInfos.set(mint.toBase58(), { owner: info.owner.toBase58(), decimals });
    });
  }

  for (const group of chunks(mints, 100)) {
    const metas = group.map((mint) => metadataPda(mint));
    const infos = await connection.getMultipleAccountsInfo(metas);
    infos.forEach((info, i) => {
      const mint = group[i];
      if (!info || !mint) return;
      const parsed = readMetadataNameSymbol(info.data);
      if (parsed?.symbol || parsed?.name) names.set(mint.toBase58(), { name: parsed.name, symbol: parsed.symbol });
    });
  }

  const missing = mints.map((m) => m.toBase58()).filter((m) => !names.get(m)?.symbol);
  const images = new Map<string, string>();
  for (const group of chunks(missing, 100)) {
    try {
      const assets = await getAssetBatch(group);
      assets.forEach((asset, i) => {
        const id = asset?.id || group[i];
        if (!id || !asset) return;
        const symbol = asset.content?.metadata?.symbol?.trim() || asset.token_info?.symbol?.trim() || "";
        const name = asset.content?.metadata?.name?.trim() || "";
        if (symbol || name) names.set(id, { name, symbol });
        const image = asset.content?.links?.image || asset.content?.files?.[0]?.cdn_uri || asset.content?.files?.[0]?.uri;
        if (image) images.set(id, image);
      });
    } catch {
      // Names fall back to the mint. The quote list itself is on-chain.
    }
  }

  const quotes: FloatQuoteView[] = [];
  for (const q of decoded) {
    const id = q.mint.toBase58();
    const mint = mintInfos.get(id);
    if (!mint) continue;
    const meta = names.get(id);
    const symbol = meta?.symbol || `${id.slice(0, 4)}…`;
    quotes.push({
      mint: id,
      symbol,
      name: meta?.name || "Quote token",
      decimals: mint.decimals,
      tokenProgram: mint.owner,
      globalConfig: q.globalConfig.toBase58(),
      startFdv: q.startFdv.toString(),
      image: images.get(id) || null,
    });
  }

  quotes.sort((a, b) => {
    const d = rank(a.symbol) - rank(b.symbol);
    if (d !== 0) return d;
    return a.symbol.localeCompare(b.symbol);
  });

  const body: FloatCatalog = {
    launchesPaused: config.launchesPaused,
    treasury: config.treasury.toBase58(),
    feeSplit: config.feeSplit,
    raydiumFeeUnits: RAYDIUM_CURVE_FEE_UNITS.toString(),
    takeoverFlatLamports: config.tickerTakeoverLamports.toString(),
    protectSecs: config.tickerProtectSecs.toString(),
    tiers: config.tierFeeRates.flatMap((units, index) => {
      const platform = config.platforms[index];
      if (!platform || platform.equals(PublicKey.default)) return [];
      return [{
        index,
        feeUnits: units.toString(),
        label: formatFeePercent(units),
        platform: platform.toBase58(),
      }];
    }),
    quotes,
  };
  cache = { at: Date.now(), body };
  return body;
}
