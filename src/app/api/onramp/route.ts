import { NextResponse } from "next/server";

// Onramp is in transition (MoonPay → Crossmint). UI is gated behind
// NEXT_PUBLIC_ONRAMP_ENABLED, but keep the route in place so any
// accidental call returns a clean 503 instead of 500ing.
export async function GET() {
  return NextResponse.json(
    { error: "Onramp is not yet available" },
    { status: 503 },
  );
}
