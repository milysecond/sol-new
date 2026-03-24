import { NextRequest, NextResponse } from "next/server";

// Rate limit: stricter for uploads
const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 3; // max 3 uploads per minute
const WINDOW_MS = 60_000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "No image" }, { status: 400 });

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Validate content type
    const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    // Upload to metasal API (IPFS)
    const ipfsForm = new FormData();
    ipfsForm.append("image", file);
    const ipfsRes = await fetch("https://api.metasal.xyz/api/upload", {
      method: "POST",
      body: ipfsForm,
    });
    const ipfsUrl = (await ipfsRes.text()).trim();

    // Also create a base64 data URL for immediate display
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;

    return NextResponse.json({ ipfs: ipfsUrl, preview: dataUrl });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
