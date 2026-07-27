import { NextResponse } from "next/server";

type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
  image: string | null;
  solana?: boolean;
};

const FEEDS: { url: string; source: string; alwaysSolana?: boolean }[] = [
  { url: "https://devrels.xyz/feed.xml", source: "devrels.xyz", alwaysSolana: true },
  { url: "https://solanaanz.org/rss.xml", source: "Solana ANZ", alwaysSolana: true },
  { url: "https://cointelegraph.com/rss/tag/solana", source: "Cointelegraph" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://thedefiant.io/api/feed", source: "The Defiant" },
];

const SOLANA_RE = /\bsol(ana)?\b|\bsaga\b|\bjupiter\b|\bjito\b|\bphantom\b|\bpump\.?fun\b|\bdrift\b|\btensor\b/i;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : null;
}

function extractImage(block: string): string | null {
  const media = block.match(/<media:content[^>]*url="([^"]+)"/i) || block.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
  if (media) return media[1];
  const enc = block.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i);
  if (enc) return enc[1];
  const content = tag(block, "content:encoded") || tag(block, "description") || "";
  const img = content.match(/<img[^>]*src="([^"]+)"/i);
  return img ? img[1] : null;
}

function parseFeed(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const rawTitle = tag(block, "title");
    if (!rawTitle) continue;
    const title = decodeEntities(rawTitle);

    // RSS uses <link>url</link>; Atom uses <link href="url"/>
    let link = (tag(block, "link") || "").trim();
    if (!link) {
      const atom = block.match(/<link[^>]*href="([^"]+)"/i);
      if (atom) link = atom[1];
    }
    link = decodeEntities(link);
    if (!title || !link) continue;

    const dateRaw = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date") || "";
    const parsed = dateRaw ? new Date(decodeEntities(dateRaw)) : null;
    const pubDate = parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : "";

    items.push({ title, link, source, pubDate, image: extractImage(block) });
  }
  return items;
}

async function fetchFeed(url: string, source: string, alwaysSolana = false): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; sol.new-news/1.0; +https://sol.new)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseFeed(xml, source);
    return alwaysSolana ? items.map((it) => ({ ...it, solana: true })) : items;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.url, f.source, f.alwaysSolana)));
    const merged = results.flat();

    // Dedupe by link, keep the first (feeds are ordered Solana-first).
    const seen = new Set<string>();
    const deduped = merged.filter((it) => {
      const key = it.link.split("?")[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Prioritise Solana-relevant items, then sort by recency.
    const withRelevance = deduped.map((it) => ({
      ...it,
      solana: (it as { solana?: boolean }).solana ?? SOLANA_RE.test(it.title),
    }));
    withRelevance.sort((a, b) => {
      if (a.solana !== b.solana) return a.solana ? -1 : 1;
      const ta = a.pubDate ? Date.parse(a.pubDate) : 0;
      const tb = b.pubDate ? Date.parse(b.pubDate) : 0;
      return tb - ta;
    });

    const items = withRelevance.slice(0, 40);

    return NextResponse.json(
      { items, count: items.length },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }
    );
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) }, { status: 200 });
  }
}
