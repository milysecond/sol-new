import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { db, initDb } from "@/lib/db";
import { generatePoapCode, rowToDrop } from "@/lib/poap";

export const runtime = "nodejs";

/** POST — create drop. GET — list drops for issuer=? */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const issuer = req.nextUrl.searchParams.get("issuer")?.trim() || "";
    if (!issuer) {
      return NextResponse.json({ error: "issuer required" }, { status: 400 });
    }
    try {
      new PublicKey(issuer);
    } catch {
      return NextResponse.json({ error: "Invalid issuer" }, { status: 400 });
    }
    const rs = await db.execute({
      sql: `SELECT * FROM poap_drops WHERE issuer = ? ORDER BY created_at DESC LIMIT 50`,
      args: [issuer],
    });
    const drops = rs.rows.map((r) => rowToDrop(r as Record<string, unknown>));
    return NextResponse.json({ ok: true, drops });
  } catch (e) {
    console.error("poap GET", e);
    return NextResponse.json({ error: "Failed to list drops" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      imageUrl?: string;
      location?: string;
      issuer?: string;
      maxClaims?: number | null;
      startsAt?: string | null;
      endsAt?: string | null;
    };

    const title = (body.title || "").trim().slice(0, 80);
    if (title.length < 2) {
      return NextResponse.json({ error: "Title required (min 2 chars)" }, { status: 400 });
    }
    const issuer = (body.issuer || "").trim();
    try {
      new PublicKey(issuer);
    } catch {
      return NextResponse.json({ error: "Valid issuer wallet required" }, { status: 400 });
    }

    const description = (body.description || "").trim().slice(0, 500) || null;
    const imageUrl = (body.imageUrl || "").trim().slice(0, 500) || null;
    const location = (body.location || "").trim().slice(0, 120) || null;
    let maxClaims: number | null = null;
    if (body.maxClaims != null && body.maxClaims !== undefined) {
      const n = Number(body.maxClaims);
      if (!Number.isFinite(n) || n < 1 || n > 100_000) {
        return NextResponse.json({ error: "maxClaims must be 1–100000" }, { status: 400 });
      }
      maxClaims = Math.floor(n);
    }

    // unique code
    let code = generatePoapCode(8);
    for (let i = 0; i < 5; i++) {
      const exists = await db.execute({
        sql: `SELECT 1 FROM poap_drops WHERE code = ? LIMIT 1`,
        args: [code],
      });
      if (!exists.rows.length) break;
      code = generatePoapCode(8);
    }

    await db.execute({
      sql: `INSERT INTO poap_drops
        (code, title, description, image_url, location, issuer, max_claims, starts_at, ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        code,
        title,
        description,
        imageUrl,
        location,
        issuer,
        maxClaims,
        body.startsAt || null,
        body.endsAt || null,
      ],
    });

    const drop = rowToDrop({
      code,
      title,
      description,
      image_url: imageUrl,
      location,
      issuer,
      max_claims: maxClaims,
      claim_count: 0,
      starts_at: body.startsAt || null,
      ends_at: body.endsAt || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, drop, url: `https://sol.new/poap/${code}` });
  } catch (e) {
    console.error("poap POST", e);
    return NextResponse.json({ error: "Failed to create drop" }, { status: 500 });
  }
}
