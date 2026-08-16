/**
 * Helius DAS helpers (server-only). Uses paid mainnet RPC pool.
 */

import { mainnetRpcEndpoints } from "./rpc-server";

export type DasAsset = {
  id: string;
  interface?: string;
  content?: {
    json_uri?: string;
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      token_standard?: string;
    };
    links?: { image?: string; external_url?: string };
    files?: { uri?: string; cdn_uri?: string; mime?: string }[];
  };
  grouping?: { group_key: string; group_value: string }[];
  ownership?: { owner?: string; frozen?: boolean; delegated?: boolean };
  compression?: { compressed?: boolean };
  token_info?: { balance?: number; decimals?: number; symbol?: string };
  creators?: { address: string; verified?: boolean; share?: number }[];
};

export type NftCard = {
  id: string;
  mint: string;
  name: string;
  symbol: string | null;
  description: string | null;
  image: string | null;
  collection: string | null;
  compressed: boolean;
  interface: string | null;
  meUrl: string;
  tensorUrl: string;
  solscanUrl: string;
  /** SOL listing or floor estimate */
  priceSol?: number | null;
  priceSource?: "listing" | "floor" | null;
  listed?: boolean;
};

function assetImage(a: DasAsset): string | null {
  const links = a.content?.links?.image;
  if (links) return links;
  const file = a.content?.files?.[0];
  return file?.cdn_uri || file?.uri || null;
}

function collectionName(a: DasAsset): string | null {
  const g = a.grouping?.find((x) => x.group_key === "collection");
  return g?.group_value || null;
}

export function toNftCard(a: DasAsset): NftCard {
  const mint = a.id;
  const name = a.content?.metadata?.name?.trim() || mint.slice(0, 8) + "…";
  return {
    id: mint,
    mint,
    name,
    symbol: a.content?.metadata?.symbol || null,
    description: a.content?.metadata?.description || null,
    image: assetImage(a),
    collection: collectionName(a),
    compressed: Boolean(a.compression?.compressed),
    interface: a.interface || null,
    meUrl: `https://magiceden.io/item-details/${mint}`,
    tensorUrl: `https://www.tensor.trade/item/${mint}`,
    solscanUrl: `/token/${mint}`,
  };
}

async function dasRpc<T>(method: string, params: unknown): Promise<T> {
  const endpoints = mainnetRpcEndpoints();
  let lastErr: Error | null = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "sol-new", method, params }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        lastErr = new Error(`RPC HTTP ${res.status}`);
        continue;
      }
      const j = (await res.json()) as { result?: T; error?: { message: string } };
      if (j.error) {
        lastErr = new Error(j.error.message);
        continue;
      }
      return j.result as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr || new Error("DAS RPC failed");
}

export async function getAssetsByOwner(opts: {
  owner: string;
  page?: number;
  limit?: number;
}): Promise<{ items: NftCard[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 48));

  const result = await dasRpc<{
    total?: number;
    items?: DasAsset[];
  }>("getAssetsByOwner", {
    ownerAddress: opts.owner,
    page,
    limit,
    sortBy: { sortBy: "created", sortDirection: "desc" },
    displayOptions: {
      showFungible: false,
      showNativeBalance: false,
      showCollectionMetadata: true,
      showUnverifiedCollections: true,
    },
  });

  const raw = result?.items || [];
  // Drop pure fungibles if any slip through
  const nfts = raw.filter((a) => {
    const iface = (a.interface || "").toLowerCase();
    if (iface.includes("fungible") && !iface.includes("nonfungible")) return false;
    // Keep NFTs, programmable NFTs, compressed, etc.
    return true;
  });

  return {
    items: nfts.map(toNftCard),
    total: result?.total ?? nfts.length,
    page,
    limit,
  };
}
