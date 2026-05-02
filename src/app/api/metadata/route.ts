import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { initDb, saveMetadata } from "@/lib/db";
import { notifyEvent } from "@/lib/notify";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const ts = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (ts.length >= RATE_LIMIT) return true;
  ts.push(now);
  recentIPs.set(ip, ts);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (typeof body.name !== "string" || body.name.length === 0 || body.name.length > 200) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (typeof body.symbol !== "string" || body.symbol.length === 0 || body.symbol.length > 32) {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const json = JSON.stringify(body);
    if (json.length > 16 * 1024) {
      return NextResponse.json({ error: "Metadata too large (max 16KB)" }, { status: 413 });
    }

    await initDb();
    const id = crypto.randomBytes(8).toString("hex");
    const wallet = typeof body.creator === "string" ? body.creator : null;
    await saveMetadata(id, json, wallet);

    const origin = req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : new URL(req.url).origin;
    const uri = `${origin}/metadata/${id}.json`;

    notifyEvent({
      kind: "metadata_upload",
      emoji: "📝",
      title: "Metadata stored",
      fields: { id, name: body.name, symbol: body.symbol, ip, sizeBytes: json.length },
    });

    return NextResponse.json({ id, uri });
  } catch (e) {
    notifyEvent({
      kind: "metadata_upload_error",
      emoji: "⚠️",
      title: "Metadata store failed",
      fields: { ip, error: String(e) },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
