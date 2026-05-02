import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { put } from "@vercel/blob";
import { initDb, saveImageRef } from "@/lib/db";
import { notifyEvent } from "@/lib/notify";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 3;
const WINDOW_MS = 60_000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

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
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "No image" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }
    const ext = EXT[file.type];
    if (!ext) return NextResponse.json({ error: "Invalid file type" }, { status: 400 });

    const id = crypto.randomBytes(8).toString("hex");
    const blobPath = `images/${id}.${ext}`;
    const blob = await put(blobPath, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });

    await initDb();
    await saveImageRef(id, blob.url, file.type, file.size);

    const origin = req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : new URL(req.url).origin;
    const url = `${origin}/images/${id}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const dataUrl = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString("base64")}`;

    notifyEvent({
      kind: "image_upload",
      emoji: "📤",
      title: "Image uploaded",
      fields: { id, type: file.type, sizeKb: Math.round(file.size / 1024), url, ip },
    });

    return NextResponse.json({ url, preview: dataUrl });
  } catch (e) {
    notifyEvent({
      kind: "image_upload_error",
      emoji: "⚠️",
      title: "Image upload failed",
      fields: { ip, error: String(e) },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
