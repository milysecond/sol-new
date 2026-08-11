import { MetadataRoute } from "next";
import { getRecentTokens } from "@/lib/db";

const BASE = "https://sol.new";

// Runtime-generated: env/DB bindings are not available during the OpenNext
// build, so query the live DB per request (cached at the edge) instead.
export const dynamic = "force-dynamic";

/**
 * Indexable product URLs only.
 * Do NOT list pure redirects (/wheel→/draw, /flip, /dice, /splash, /vrf, /track)
 * or short-link destinations (/link/<code>) — GSC flags those as "Page with redirect".
 */
const STATIC_ROUTES: {
  path: string;
  priority: number;
  freq: MetadataRoute.Sitemap[number]["changeFrequency"];
}[] = [
  { path: "/", priority: 1.0, freq: "daily" },
  { path: "/home", priority: 0.95, freq: "weekly" },
  { path: "/onboard", priority: 0.9, freq: "weekly" },
  { path: "/token", priority: 0.9, freq: "daily" },
  { path: "/nft", priority: 0.9, freq: "daily" },
  { path: "/multisig", priority: 0.8, freq: "weekly" },
  { path: "/wallet", priority: 0.8, freq: "weekly" },
  { path: "/wallet/get", priority: 0.7, freq: "weekly" },
  { path: "/get", priority: 0.8, freq: "weekly" },
  { path: "/pay", priority: 0.8, freq: "weekly" },
  { path: "/pos", priority: 0.85, freq: "weekly" },
  { path: "/sub", priority: 0.85, freq: "weekly" },
  { path: "/split", priority: 0.8, freq: "weekly" },
  { path: "/gift", priority: 0.8, freq: "weekly" },
  { path: "/poap", priority: 0.8, freq: "weekly" },
  { path: "/link", priority: 0.7, freq: "weekly" }, // create UI only
  { path: "/punt", priority: 0.8, freq: "hourly" },
  { path: "/portfolio", priority: 0.6, freq: "weekly" },
  { path: "/launch", priority: 0.9, freq: "daily" },
  { path: "/scan", priority: 0.7, freq: "daily" },
  { path: "/address", priority: 0.75, freq: "daily" },
  { path: "/receipt", priority: 0.6, freq: "weekly" },
  { path: "/draw", priority: 0.8, freq: "weekly" }, // canonical RNG UI
  { path: "/news", priority: 0.7, freq: "hourly" },
  { path: "/pods", priority: 0.6, freq: "weekly" },
  { path: "/compare", priority: 0.7, freq: "weekly" },
  { path: "/docs", priority: 0.7, freq: "weekly" },
  { path: "/features", priority: 0.8, freq: "weekly" },
  { path: "/changelog", priority: 0.7, freq: "weekly" },
  { path: "/whats-new", priority: 0.7, freq: "hourly" },
  { path: "/nfts", priority: 0.7, freq: "weekly" },
  { path: "/stocks", priority: 0.8, freq: "hourly" },
  { path: "/earn", priority: 0.7, freq: "weekly" },
  { path: "/loan", priority: 0.8, freq: "hourly" },
  { path: "/swap", priority: 0.85, freq: "hourly" },
  { path: "/starter", priority: 0.9, freq: "weekly" },
  { path: "/clip", priority: 0.85, freq: "weekly" },
  { path: "/frame", priority: 0.75, freq: "weekly" },
  { path: "/stake", priority: 0.7, freq: "weekly" },
  { path: "/lst", priority: 0.7, freq: "weekly" },
  { path: "/burn", priority: 0.6, freq: "weekly" },
  { path: "/dir", priority: 0.5, freq: "weekly" },
  { path: "/privacy", priority: 0.3, freq: "yearly" },
  { path: "/terms", priority: 0.3, freq: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: r.path === "/" ? `${BASE}/` : `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));

  let tokenEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = (await getRecentTokens(5000, 0, "mainnet")) as unknown as Array<{
      mint_address: string | null;
      created_at: string | null;
    }>;
    tokenEntries = rows
      .filter((t) => t.mint_address)
      .map((t) => {
        const created = t.created_at ? new Date(`${t.created_at}Z`) : now;
        return {
          url: `${BASE}/token/${t.mint_address}`,
          lastModified: isNaN(created.getTime()) ? now : created,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        };
      });
  } catch {
    /* DB unreachable — static routes still valid */
  }

  return [...staticEntries, ...tokenEntries];
}
