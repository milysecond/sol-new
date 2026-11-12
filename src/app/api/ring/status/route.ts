import { NextResponse } from "next/server";
import { ringEndpoints } from "@/lib/ring/proxy";

export const dynamic = "force-dynamic";

/** Whether /ring has an endpoint pool. Never returns the endpoints. */
export async function GET() {
  const n = ringEndpoints().length;
  return NextResponse.json(
    { configured: n > 0, endpoints: n, network: "mainnet", beta: true },
    { headers: { "cache-control": "no-store" } },
  );
}
