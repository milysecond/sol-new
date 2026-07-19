import { NextRequest, NextResponse } from "next/server";
import {
  parseEmail,
  resendConfigured,
  subscribeToMailingList,
} from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Simple in-memory rate limit: max 8 subscribes per IP per hour. */
const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 8;
const WINDOW_MS = 60 * 60 * 1000;

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

export async function POST(request: NextRequest) {
  if (!resendConfigured()) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  let body: {
    email?: string;
    firstName?: string;
    name?: string;
    product?: boolean;
    launches?: boolean;
    source?: string;
    /** Honeypot — bots fill this; real users leave empty */
    website?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot: silent success so bots think it worked
  if (body.website && String(body.website).trim()) {
    return NextResponse.json({ ok: true });
  }

  const email = parseEmail(body.email ?? null);
  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const firstName =
    (typeof body.firstName === "string" && body.firstName) ||
    (typeof body.name === "string" && body.name) ||
    undefined;

  try {
    const result = await subscribeToMailingList({
      email,
      firstName,
      product: body.product !== false,
      launches: body.launches !== false,
      source:
        typeof body.source === "string"
          ? body.source.slice(0, 64)
          : "web",
      sendWelcome: true,
    });

    return NextResponse.json({
      ok: true,
      email,
      created: result.created,
      alreadySubscribed: result.alreadySubscribed,
      message: result.alreadySubscribed
        ? "You’re already on the list."
        : "You’re in. Check your inbox for a welcome note.",
    });
  } catch (e) {
    console.error("[subscribe]", e);
    const msg = e instanceof Error ? e.message : "Subscribe failed";
    // Resend duplicate email is still success for the user
    if (/already|exist/i.test(msg)) {
      return NextResponse.json({
        ok: true,
        email,
        alreadySubscribed: true,
        message: "You’re already on the list.",
      });
    }
    return NextResponse.json(
      { error: "Couldn’t subscribe right now. Try again." },
      { status: 502 }
    );
  }
}
