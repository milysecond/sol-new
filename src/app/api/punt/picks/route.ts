import { NextRequest, NextResponse } from "next/server";
import { initDb, savePuntPick, getWalletPuntPicks } from "@/lib/db";
import { getPuntMatches, settleDuePicks, PICK_KEYS, type PickKey } from "@/lib/punt-data";

export const dynamic = "force-dynamic";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

function isPubkeyish(s: unknown): s is string {
  return typeof s === "string" && s.length >= 32 && s.length <= 64;
}

// Record a pick. Free to play — no stakes, points only. Picks lock at kickoff
// and everything is validated against the live fixture list server-side.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const { wallet, fixtureId, pick } = (await req.json()) as {
      wallet?: string;
      fixtureId?: number;
      pick?: string;
    };
    if (!isPubkeyish(wallet)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    if (!PICK_KEYS.includes(pick as PickKey)) return NextResponse.json({ error: "Invalid pick" }, { status: 400 });

    const { matches } = await getPuntMatches();
    const match = matches.find((m) => m.fixtureId === Number(fixtureId));
    if (!match) return NextResponse.json({ error: "Unknown fixture" }, { status: 400 });
    if (match.startTime <= Date.now() || match.live) {
      return NextResponse.json({ error: "Picks lock at kickoff" }, { status: 400 });
    }

    const outcome = match.outcomes.find((o) => o.key === pick);
    await savePuntPick({
      wallet,
      fixtureId: match.fixtureId,
      pick: pick as PickKey,
      pickLabel: outcome?.name ?? (pick as string),
      price: outcome?.price ? Math.round(outcome.price * 1000) : null,
      home: match.home,
      away: match.away,
      startTime: match.startTime,
    });
    return NextResponse.json({ ok: true, points: outcome?.price ? Math.round(outcome.price * 10) : 10 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// A wallet's picks (settling anything due first, since there's no cron).
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!isPubkeyish(wallet)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });

    await settleDuePicks().catch(() => {});
    const rows = await getWalletPuntPicks(wallet);
    return NextResponse.json({
      picks: rows.map((r) => ({
        fixtureId: Number(r.fixture_id),
        pick: r.pick as string,
        pickLabel: r.pick_label as string | null,
        price: r.price != null ? Number(r.price) / 1000 : null,
        home: r.home as string,
        away: r.away as string,
        startTime: Number(r.start_time),
        settled: Number(r.settled) === 1,
        result: (r.result as string | null) ?? null,
        points: Number(r.points),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
