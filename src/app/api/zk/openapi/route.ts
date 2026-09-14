import { NextResponse } from "next/server";

const DOCS = "https://zk.sol.new";
const CANDIDATES = [
  "/docs/json",
  "/openapi.json",
  "/docs/openapi.json",
  "/swagger.json",
  "/docs/swagger.json",
  "/api/openapi.json",
];

export async function GET() {
  const errors: string[] = [];
  for (const path of CANDIDATES) {
    try {
      const res = await fetch(`${DOCS}${path}`, {
        headers: { Accept: "application/json", "User-Agent": "sol.new" },
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) {
        errors.push(`${path} ${res.status}`);
        continue;
      }
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        if (json.openapi || json.swagger || json.paths) {
          return NextResponse.json({ ok: true, spec: json, source: `${DOCS}${path}` });
        }
      } catch {
        errors.push(`${path} not json`);
      }
    } catch (e) {
      errors.push(`${path} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return NextResponse.json({ ok: false, error: "Could not load zk.sol.new OpenAPI", tried: errors }, { status: 502 });
}
