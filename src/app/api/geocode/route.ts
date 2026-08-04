import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export type GeocodeHit = {
  label: string;
  lat: number;
  lng: number;
  kind?: string;
};

/**
 * GET /api/geocode?q=venue+or+address
 * OpenStreetMap Nominatim — free, rate-limited. Server-side for UA + CORS.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "0");

    const r = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        // Nominatim requires a valid identifying UA
        "User-Agent": "sol.new-poap/1.0 (https://sol.new; gm@metasal.xyz)",
      },
      // edge/cf: don't cache forever
      next: { revalidate: 3600 },
    } as RequestInit);

    if (!r.ok) {
      return NextResponse.json({ error: "Geocoder unavailable" }, { status: 502 });
    }

    const raw = (await r.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
      type?: string;
      class?: string;
    }>;

    const hits: GeocodeHit[] = [];
    for (const row of raw) {
      const lat = Number(row.lat);
      const lng = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const label = (row.display_name || "").trim();
      if (!label) continue;
      hits.push({
        label: label.slice(0, 200),
        lat,
        lng,
        kind: row.type || row.class,
      });
    }

    return NextResponse.json({ ok: true, hits });
  } catch (e) {
    console.error("geocode", e);
    return NextResponse.json({ error: "Geocode failed" }, { status: 500 });
  }
}
