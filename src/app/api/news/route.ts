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

const SOLANA_RE =
  /\bsol(ana)?\b|\bsaga\b|\bjupiter\b|\bjito\b|\bphantom\b|\bpump\.?fun\b|\bdrift\b|\btensor\b/i;

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

function attr(tagHtml: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = tagHtml.match(re);
  return m?.[1] || null;
}

function absolutize(url: string | null | undefined, baseLink: string): string | null {
  if (!url) return null;
  let u = url.trim();
  if (!u || u.startsWith("data:")) return null;
  // protocol-relative
  if (u.startsWith("//")) u = `https:${u}`;
  try {
    if (/^https?:\/\//i.test(u)) return u;
    const base = new URL(baseLink);
    return new URL(u, base.origin).toString();
  } catch {
    return null;
  }
}

function extractImage(block: string, link: string): string | null {
  // media:content / media:thumbnail (single or double quotes, url= anywhere)
  const media =
    block.match(/<media:(?:content|thumbnail)\b[^>]*\burl\s*=\s*["']([^"']+)["']/i) ||
    block.match(/<media:(?:content|thumbnail)\b[^>]*\burl\s*=\s*([^\s>]+)/i);
  if (media?.[1]) return absolutize(media[1].replace(/&amp;/g, "&"), link);

  // enclosure — prefer image/*, else any image-looking URL
  const enclosures = block.match(/<enclosure\b[^>]*>/gi) || [];
  for (const enc of enclosures) {
    const type = attr(enc, "type") || "";
    const url = attr(enc, "url");
    if (url && (/^image\//i.test(type) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) {
      return absolutize(url.replace(/&amp;/g, "&"), link);
    }
  }

  // itunes:image href=
  const itunes = block.match(/<itunes:image[^>]*href\s*=\s*["']([^"']+)["']/i);
  if (itunes?.[1]) return absolutize(itunes[1], link);

  // content / description img src
  const content =
    tag(block, "content:encoded") ||
    tag(block, "content") ||
    tag(block, "description") ||
    "";
  const img =
    content.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i) ||
    content.match(/srcset\s*=\s*["']([^"'\s]+)/i);
  if (img?.[1]) return absolutize(img[1].replace(/&amp;/g, "&"), link);

  // og-style meta in content
  const og = content.match(
    /property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i,
  ) || content.match(/content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i);
  if (og?.[1]) return absolutize(og[1], link);

  return null;
}

/** Source-colored placeholder when feed has no image (never blank tile). */
function fallbackImage(source: string, title: string): string {
  const label = encodeURIComponent((source || "NEWS").slice(0, 18).toUpperCase());
  const seed = encodeURIComponent(title.slice(0, 40) || source);
  // deterministic gradient placeholder via dicebear shapes + text overlay alternative:
  // Use ui-avatars for reliable HTTPS images
  return `https://ui-avatars.com/api/?name=${label}&background=7c3aed&color=fff&size=128&bold=true&format=png&seed=${seed}`;
}

function parseFeed(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks =
    xml.match(/<item[\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s\S]*?<\/entry>/gi) ||
    [];
  for (const block of blocks) {
    const rawTitle = tag(block, "title");
    if (!rawTitle) continue;
    const title = decodeEntities(rawTitle);

    let link = (tag(block, "link") || "").trim();
    if (!link) {
      const atom = block.match(/<link[^>]*href\s*=\s*["']([^"']+)["']/i);
      if (atom) link = atom[1];
    }
    link = decodeEntities(link);
    if (!title || !link) continue;

    const dateRaw =
      tag(block, "pubDate") ||
      tag(block, "published") ||
      tag(block, "updated") ||
      tag(block, "dc:date") ||
      "";
    const parsed = dateRaw ? new Date(decodeEntities(dateRaw)) : null;
    const pubDate =
      parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : "";

    const image =
      extractImage(block, link) || fallbackImage(source, title);

    items.push({ title, link, source, pubDate, image });
  }
  return items;
}

async function fetchFeed(
  url: string,
  source: string,
  alwaysSolana = false,
): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; sol.new-news/1.1; +https://sol.new/news)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 300 },
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
    const results = await Promise.all(
      FEEDS.map((f) => fetchFeed(f.url, f.source, f.alwaysSolana)),
    );
    const merged = results.flat();

    const seen = new Set<string>();
    const deduped = merged.filter((it) => {
      const key = it.link.split("?")[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const withRelevance = deduped.map((it) => ({
      ...it,
      solana: (it as { solana?: boolean }).solana ?? SOLANA_RE.test(it.title),
      // guarantee image
      image: it.image || fallbackImage(it.source, it.title),
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
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
        },
      },
    );
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) }, { status: 200 });
  }
}
