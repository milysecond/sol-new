import { NextResponse } from "next/server";

const ORIGIN = "https://zk.sol.new";

async function grab(path: string): Promise<unknown> {
  const res = await fetch(`${ORIGIN}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "sol.new" },
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 200), status: res.status };
  }
}

export async function GET() {
  const [health, ready, config, relayer] = await Promise.all([
    grab("/health"),
    grab("/ready"),
    grab("/v1/config"),
    grab("/v1/relayer"),
  ]);
  return NextResponse.json({
    ok: true,
    health,
    ready,
    config,
    relayer,
    docs: `${ORIGIN}/docs`,
  });
}
