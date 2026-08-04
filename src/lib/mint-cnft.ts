/**
 * Helius mintCompressedNft — platform-sponsored cNFT mint.
 */
import { mainnetRpcUrl, devnetRpcUrl } from "@/lib/rpc-server";

export async function mintCompressedNft(opts: {
  owner: string;
  name: string;
  symbol?: string;
  uri: string;
  description?: string;
  network?: "mainnet" | "devnet";
  externalUrl?: string;
  attributes?: { trait_type: string; value: string }[];
}): Promise<{ assetId: string; signature: string }> {
  const rpcUrl =
    opts.network === "devnet" ? devnetRpcUrl() : mainnetRpcUrl();

  const params: Record<string, unknown> = {
    name: opts.name.slice(0, 32),
    symbol: (opts.symbol || "POAP").slice(0, 10),
    owner: opts.owner,
    description: (opts.description || "").slice(0, 1000),
    uri: opts.uri,
    sellerFeeBasisPoints: 0,
  };
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
