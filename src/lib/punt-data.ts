// Shared World Cup match data + pick settlement for /punt and its APIs.
// Free-to-play only: picks cost nothing and pay nothing — points and a
// leaderboard. Settlement reads TxLINE's cryptographically-anchored scores.

import {
  getFixtures,
  getOddsSnapshot,
  getScoresSnapshot,
  WORLD_CUP_COMPETITION_ID,
  type TxFixture,
  type TxOddsPayload,
  type TxScoreEvent,
} from "./txline";
import { getUnsettledFixtures, settleFixturePicks } from "./db";

export const PUNT_RPC =
  process.env.MAINNET_RPC ||
  (process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : "https://eu.fluxrpc.com?key=04a32b3f-cf44-48fb-8c13-faace267ee5d");

const CACHE_MS = 60_000; // free tier data is sampled every 60s anyway
const MAX_MATCHES = 16;

export type PickKey = "part1" | "draw" | "part2";
export const PICK_KEYS: PickKey[] = ["part1", "draw", "part2"];

export interface PuntOutcome {
  key: string; // canonical feed key: part1/draw/part2 (or over/under…)
  name: string;
  price: number | null; // decimal odds
  pct: number | null; // implied probability (de-margined)
}

export interface PuntMatch {
  fixtureId: number;
  competition: string;
  home: string;
  away: string;
  startTime: number;
  live: boolean;
  gameState: string | null;
  market: string | null;
  outcomes: PuntOutcome[];
}

let cache: { body: { updatedAt: number; matches: PuntMatch[] }; ts: number } | null = null;

// TxLINE prices are integer thousandths (2500 = 2.50).
function toDecimalOdds(raw: number | undefined): number | null {
  if (raw == null || raw <= 0) return null;
  const scaled = raw / 1000;
  if (scaled >= 1.01 && scaled < 1000) return scaled;
  return raw >= 1.01 && raw < 1000 ? raw : null;
}

function pickMarket(payloads: TxOddsPayload[]): TxOddsPayload | null {
  const withPrices = payloads.filter((p) => (p.Prices?.length ?? 0) >= 2 && (p.PriceNames?.length ?? 0) >= 2);
  if (!withPrices.length) return null;
  // Prefer the full-time 1X2 (match result); StablePrice publishes half=1
  // markets earliest, so fall back to those with a clear label.
  const scored = withPrices
    .map((p) => {
      let score = 0;
      if (/1x2/i.test(p.SuperOddsType)) score += 8;
      if (!p.MarketPeriod) score += 4; // null period = full match
      if ((p.Pct ?? []).some((x) => x !== "NA")) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || b.p.Ts - a.p.Ts);
  return scored[0].p;
}

// Outcome names reference feed participants (part1/part2), not home/away.
function outcomeName(name: string, fixture: TxFixture): string {
  const n = name.toLowerCase();
  if (n === "part1" || n === "1") return fixture.Participant1;
  if (n === "part2" || n === "2") return fixture.Participant2;
  if (n === "draw" || n === "x") return "Draw";
  if (n === "over" || n === "under") return name.charAt(0).toUpperCase() + n.slice(1);
  return name;
}

function outcomeKey(name: string): string {
  const n = name.toLowerCase();
  if (n === "part1" || n === "1") return "part1";
  if (n === "part2" || n === "2") return "part2";
  if (n === "draw" || n === "x") return "draw";
  return n;
}

function marketLabel(market: TxOddsPayload): string {
  const kind = /1x2/i.test(market.SuperOddsType)
    ? "Result"
    : /overunder/i.test(market.SuperOddsType)
      ? `Goals over/under ${market.MarketParameters?.replace("line=", "") ?? ""}`.trim()
      : /handicap/i.test(market.SuperOddsType)
        ? `Handicap ${market.MarketParameters?.replace("line=", "") ?? ""}`.trim()
        : market.SuperOddsType;
  const period =
    market.MarketPeriod === "half=1" ? "1st half" : market.MarketPeriod === "half=2" ? "2nd half" : "Full time";
  return `${kind} · ${period}`;
}

function toMatch(fixture: TxFixture, payloads: TxOddsPayload[]): PuntMatch {
  const market = pickMarket(payloads);
  const home = fixture.Participant1IsHome ? fixture.Participant1 : fixture.Participant2;
  const away = fixture.Participant1IsHome ? fixture.Participant2 : fixture.Participant1;

  const outcomes: PuntOutcome[] = (market?.PriceNames ?? []).map((name, i) => ({
    key: outcomeKey(name),
    name: outcomeName(name, fixture),
    price: toDecimalOdds(market?.Prices?.[i]),
    pct: market?.Pct?.[i] && market.Pct[i] !== "NA" ? parseFloat(market.Pct[i]) : null,
  }));

  return {
    fixtureId: fixture.FixtureId,
    competition: fixture.Competition,
    home,
    away,
    startTime: fixture.StartTime,
    live: payloads.some((p) => p.InRunning),
    gameState: market?.GameState ?? null,
    market: market ? marketLabel(market) : null,
    outcomes,
  };
}

export async function getPuntMatches(): Promise<{ updatedAt: number; matches: PuntMatch[] }> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.body;

  let fixtures = await getFixtures(PUNT_RPC, WORLD_CUP_COMPETITION_ID);
  if (!fixtures.length) fixtures = await getFixtures(PUNT_RPC);

  const now = Date.now();
  const relevant = fixtures
    .filter((f) => f.StartTime > now - 3 * 3600_000) // keep in-play, drop finished
    .sort((a, b) => a.StartTime - b.StartTime)
    .slice(0, MAX_MATCHES);

  const oddsResults = await Promise.allSettled(relevant.map((f) => getOddsSnapshot(PUNT_RPC, f.FixtureId)));
  const matches = relevant.map((f, i) => {
    const r = oddsResults[i];
    return toMatch(f, r.status === "fulfilled" ? r.value : []);
  });

  const body = { updatedAt: now, matches };
  cache = { body, ts: now };
  return body;
}

// ─── Settlement ──────────────────────────────────────────────────────────────
// The full-time 1X2 settles on the 90-minute score (H1 + H2 goals), so a match
// decided in extra time or penalties still settles as a draw. Final statuses:
// 5 = ended, 10 = ended after ET, 13 = ended after penalties.

const FINISHED_STATUSES = new Set([5, 10, 13]);

export interface ParsedResult {
  result: PickKey;
  p1Goals: number;
  p2Goals: number;
}

export function parseSoccerResult(events: TxScoreEvent[]): ParsedResult | null {
  const finished = events.some((e) => e.StatusId != null && FINISHED_STATUSES.has(e.StatusId));
  if (!finished) return null;

  // Post-match events (StatusId 100) can carry an empty Score, so use the
  // latest event that actually has one. Goals only accumulate, so latest wins.
  const scored = events
    .filter((e) => e.Score?.Participant1 || e.Score?.Participant2)
    .sort((a, b) => b.Ts - a.Ts);
  if (!scored.length) return null;

  const score = scored[0].Score!;
  const goals90 = (p?: { H1?: { Goals?: number }; H2?: { Goals?: number } }) =>
    (p?.H1?.Goals ?? 0) + (p?.H2?.Goals ?? 0);
  const p1 = goals90(score.Participant1);
  const p2 = goals90(score.Participant2);

  return { result: p1 > p2 ? "part1" : p2 > p1 ? "part2" : "draw", p1Goals: p1, p2Goals: p2 };
}

/**
 * Settle any picks whose match should be over (kickoff > 2h15m ago).
 * Called opportunistically from the picks/leaderboard routes — the OpenNext
 * worker has no cron, so readers do the settling.
 */
export async function settleDuePicks(): Promise<number> {
  const due = await getUnsettledFixtures(Date.now() - 2.25 * 3600_000);
  let settled = 0;
  for (const fixtureId of due) {
    try {
      const events = await getScoresSnapshot(PUNT_RPC, fixtureId);
      const parsed = parseSoccerResult(events);
      if (!parsed) continue; // not finished yet — retry on a later request
      await settleFixturePicks(fixtureId, parsed.result);
      settled++;
    } catch {
      // scores unavailable for this fixture — leave for a later pass or admin
    }
  }
  return settled;
}
