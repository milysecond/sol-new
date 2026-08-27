import { NextRequest, NextResponse } from "next/server";
import { getTokenByMint } from "@/lib/db";
import { getOnChainCreatedAt, formatAge } from "@/lib/onchain-age";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Token by mint — Turso row for name/image when launched on sol.new,
 * but **age always from chain** (oldest signature), never Turso created_at.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint: raw } = await params;
  const mint = raw?.trim() || "";
  if (!mint) {
    return NextResponse.json({ error: "Missing mint" }, { status: 400 });
  }

  const [tokenRow, createdAt] = await Promise.all([
    getTokenByMint(mint).catch(() => null),
    getOnChainCreatedAt(mint).catch(() => null),
  ]);

  // Enrich from chain if not in Turso
  let name = tokenRow?.name as string | undefined;
  let symbol = tokenRow?.symbol as string | undefined;
  let imageUrl = (tokenRow?.image_url as string | undefined) || null;
  let metadataUri = (tokenRow?.metadata_uri as string | undefined) || null;
  let description = (tokenRow?.description as string | undefined) || null;
  let network = (tokenRow?.network as string | undefined) || "mainnet";

  if (!name || !symbol || !imageUrl) {
    try {
      const res = await fetch(mainnetRpcUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [mint, { encoding: "jsonParsed" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const j = (await res.json()) as {
        result?: { value?: { data?: { parsed?: { info?: any }; type?: string } } };
      };
      const info = j.result?.value?.data?.parsed?.info;
      const ext = Array.isArray(info?.extensions)
        ? info.extensions.find((e: any) => e.extension === "tokenMetadata")?.state
        : null;
      if (ext) {
        name = name || ext.name;
        symbol = symbol || ext.symbol;
        metadataUri = metadataUri || ext.uri || null;
      }
      if (metadataUri && !imageUrl) {
        const meta = await fetch(metadataUri, { signal: AbortSignal.timeout(5_000) })
          .then((r) =>
            r.ok
              ? (r.json() as Promise<{
                  image?: string;
                  description?: string;
                  name?: string;
                }>)
              : null,
          )
          .catch(() => null);
        if (meta?.image) imageUrl = meta.image;
        if (meta?.description && !description) description = meta.description;
        if (meta?.name && !name) name = meta.name;
      }
    } catch {
      /* ignore */
    }
  }

  if (!tokenRow && !name) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const age = formatAge(createdAt);

  return NextResponse.json({
    ...(tokenRow || {}),
    mint_address: mint,
    name: name || "Token",
    symbol: symbol || "???",
    image_url: imageUrl,
    metadata_uri: metadataUri,
    description,
    network,
    // Always on-chain age — never Turso created_at for display
    created_at: createdAt,
    age_relative: age.relative,
    age_absolute: age.absolute,
    age_source: "chain",
  });
}
