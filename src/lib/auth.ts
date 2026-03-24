import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.SOL_NEW_API_KEY;

/**
 * Validate API key from Authorization header or x-api-key header.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function requireAuth(req: NextRequest): NextResponse | null {
  if (!API_KEY) {
    return NextResponse.json({ error: "Server misconfigured: no API key set" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");

  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : xApiKey;

  if (!token || token !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
