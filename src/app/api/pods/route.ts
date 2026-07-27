import { NextRequest, NextResponse } from "next/server";

// Parse the latest episodes of a curated show's RSS feed so they can be played
// in-page. Feeds are resolved ahead of time (the iTunes Search API rate-limits
// Cloudflare's shared Worker IPs, so we don't call it at runtime) and keyed by
// show title. Artwork comes from the feed's channel image.

const FEEDS: Record<string, string> = {
  "The Solana Podcast": "https://anchor.fm/s/1094c9c58/podcast/rss",
  Lightspeed: "https://feeds.megaphone.fm/lightspeed",
  Validated: "https://feeds.simplecast.com/W1NI2v3Z",
  Empire: "https://feeds.megaphone.fm/empire",
  Bankless: "https://feeds.flightcast.com/p83fuj0y0u58o82l41xei7zo.xml",
  Unchained: "https://feeds.megaphone.fm/LSHML4761942757",
  "The Delphi Podcast": "https://rss.buzzsprout.com/2609274.rss",
  "Zero Knowledge": "https://feeds.captivate.fm/zeroknowledge/",
  "Web3 with a16z": "https://feeds.simplecast.com/XPOpH7r4",
  "Solana Downunder": "https://anchor.fm/s/f7351e3c/podcast/rss",
  "The Metasal Pod": "https://anchor.fm/s/f7351ea0/podcast/rss",
  Quickbytes: "https://milysec.com/podcast.xml",
};

type Episode = {
  title: string;
  audioUrl: string;
  pubDate: string;
  duration: string; // normalized h:mm:ss / m:ss
  image: string | null;
};

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, (m) => {
      const hex = /x/i.test(m);
      const code = parseInt(m.replace(/[^0-9a-fA-F]/g, ""), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    })
    .trim();
}

function normalizeDuration(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.includes(":")) return s.replace(/^00:/, "");
  const total = parseInt(s, 10);
  if (!Number.isFinite(total)) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function firstMatch(block: string, re: RegExp): string {
  const m = block.match(re);
  return m ? decodeXml(m[1]) : "";
}

function channelImage(head: string): string | null {
  return (
    head.match(/<itunes:image\b[^>]*\bhref=["']([^"']+)["']/i)?.[1] ??
    head.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/i)?.[1] ??
    null
  );
}

function parseEpisodes(xml: string, limit: number, fallbackImg: string | null): Episode[] {
  const items = xml.split(/<item[\s>]/i).slice(1);
  const out: Episode[] = [];
  for (const chunk of items) {
    const block = chunk.split(/<\/item>/i)[0];
    const enc = block.match(/<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
    const audioUrl = enc ? enc[1] : "";
    if (!audioUrl) continue;
    out.push({
      title: firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i) || "Untitled episode",
      audioUrl,
      pubDate: firstMatch(block, /<pubDate>([\s\S]*?)<\/pubDate>/i),
      duration: normalizeDuration(firstMatch(block, /<itunes:duration>([\s\S]*?)<\/itunes:duration>/i)),
      image:
        (block.match(/<itunes:image\b[^>]*\bhref=["']([^"']+)["']/i)?.[1] ?? null) ||
        (block.match(/<media:content\b[^>]*\burl=["']([^"']+)["']/i)?.[1] ?? null) ||
        fallbackImg,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const show = req.nextUrl.searchParams.get("show") || "";
  const feedUrl = FEEDS[show];
  if (!feedUrl) return NextResponse.json({ episodes: [], showArt: null });

  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, limitRaw || DEFAULT_LIMIT), MAX_LIMIT);

  try {
    const rss = await fetch(feedUrl, { headers: { "user-agent": "Mozilla/5.0 (sol.new podcasts)" } });
    const xml = await rss.text();
    const head = xml.split(/<item[\s>]/i)[0];
    const showArt = channelImage(head);
    const episodes = parseEpisodes(xml, limit, showArt);

    return NextResponse.json(
      { episodes, showArt },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e), episodes: [], showArt: null }, { status: 500 });
  }
}
