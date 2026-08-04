import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { db, initDb } from "@/lib/db";
import { isPoapOpen, rowToDrop } from "@/lib/poap";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await initDb();
    const { code: raw } = await ctx.params;
    const code = (raw || "").trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    const rs = await db.execute({
      sql: `SELECT * FROM poap_drops WHERE code = ? LIMIT 1`,
      args: [code],
    });
    if (!rs.rows.length) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }
    const drop = rowToDrop(rs.rows[0] as Record<string, unknown>);
    const status = isPoapOpen(drop);
    return NextResponse.json({ ok: true, drop, ...status });
  } catch (e) {
    console.error("poap/[code] GET", e);
    return NextResponse.json({ error: "Failed to load drop" }, { status: 500 });
  }
}

/** Claim drop with connected wallet */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await initDb();
    const { code: raw } = await ctx.params;
    const code = (raw || "").trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const body = (await req.json()) as { wallet?: string };
    const wallet = (body.wallet || "").trim();
    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json({ error: "Valid wallet required" }, { status: 400 });
    }

    const rs = await db.execute({
      sql: `SELECT * FROM poap_drops WHERE code = ? LIMIT 1`,
      args: [code],
    });
    if (!rs.rows.length) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }
    const drop = rowToDrop(rs.rows[0] as Record<string, unknown>);
    const status = isPoapOpen(drop);
    if (!status.open) {
      return NextResponse.json({ error: status.reason || "Drop closed" }, { status: 400 });
    }

    // already claimed?
    const existing = await db.execute({
      sql: `SELECT claimed_at FROM poap_claims WHERE drop_code = ? AND wallet = ? LIMIT 1`,
      args: [code, wallet],
    });
    if (existing.rows.length) {
      return NextResponse.json({
        ok: true,
        already: true,
        drop,
        claimedAt: String((existing.rows[0] as { claimed_at: string }).claimed_at),
      });
    }

    try {
      await db.execute({
        sql: `INSERT INTO poap_claims (drop_code, wallet) VALUES (?, ?)`,
        args: [code, wallet],
      });
      await db.execute({
        sql: `UPDATE poap_drops SET claim_count = claim_count + 1 WHERE code = ?`,
        args: [code],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({ ok: true, already: true, drop });
      }
      throw e;
    }

    const updated = await db.execute({
      sql: `SELECT * FROM poap_drops WHERE code = ? LIMIT 1`,
      args: [code],
    });
    const next = rowToDrop(updated.rows[0] as Record<string, unknown>);

    return NextResponse.json({
      ok: true,
      already: false,
      drop: next,
      claimedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("poap/[code] POST", e);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }
}
