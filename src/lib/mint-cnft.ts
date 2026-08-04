/**
 * Helius mintCompressedNft — platform-sponsored cNFT mint.
 */
import { mainnetRpcUrl, devnetRpcUrl } from "@/lib/rpc-server";

export async function mintCompressedNft(opts: {
  owner: string;
  name: string;
  symbol?: string;
  /** Off-chain metadata JSON URI (https or data:) */
  uri?: string;
  /** Image URL or data: URI — used when Helius builds Arweave metadata */
  imageUrl?: string;
  description?: string;
  network?: "mainnet" | "devnet";
  externalUrl?: string;
  attributes?: { trait_type: string; value: string }[];
}): Promise<{ assetId: string; signature: string }> {
  const rpcUrl = opts.network === "devnet" ? devnetRpcUrl() : mainnetRpcUrl();

  if (!opts.uri && !opts.imageUrl) {
    throw new Error("mintCompressedNft requires uri or imageUrl");
  }

  const params: Record<string, unknown> = {
    name: opts.name.slice(0, 32),
    symbol: (opts.symbol || "POAP").slice(0, 10),
    owner: opts.owner,
    description: (opts.description || "").slice(0, 1000),
    sellerFeeBasisPoints: 0,
  };
  if (opts.uri) params.uri = opts.uri;
  if (opts.imageUrl) params.imageUrl = opts.imageUrl;
  if (opts.externalUrl) params.external_url = opts.externalUrl;
  if (opts.attributes?.length) params.attributes = opts.attributes;

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "sol-new-poap",
      method: "mintCompressedNft",
      params,
    }),
  });

  const data = (await res.json()) as {
    error?: { message?: string };
    result?: { assetId?: string; signature?: string };
  };
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  const assetId = data.result?.assetId;
  const signature = data.result?.signature;
  if (!assetId || !signature) {
    throw new Error("Mint returned no assetId/signature");
  }
  return { assetId, signature };
}
