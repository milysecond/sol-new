import { NextResponse } from "next/server";
import { notifyEvent } from "@/lib/notify";

const TREASURY = process.env.TREASURY_ADDRESS || "irsnx2mQq76DzVQSRFaP5SFmftuvZsnLS6nLdYb8Jmq";
const RPC = "https://api.mainnet-beta.solana.com";
const IRYS = "https://node1.irys.xyz";

const LOW_SOL = 0.01;
const LOW_IRYS_SOL = 0.001;
const ALERT_DEBOUNCE_MS = 15 * 60 * 1000;
let lastAlertAt = 0;
let lastWasLow = false;

export function isTreasuryLow(sol: number | null, irysSol: number | null): boolean {
  return (sol ?? 0) < LOW_SOL && (irysSol ?? 0) < LOW_IRYS_SOL;
}

export async function GET() {
  const [solRes, irysRes] = await Promise.allSettled([
    fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [TREASURY],
      }),
      cache: "no-store",
    }).then((r) => r.json()),
    fetch(`${IRYS}/account/balance/solana?address=${TREASURY}`, {
      cache: "no-store",
    }).then((r) => r.json()),
  ]);

  const sol =
    solRes.status === "fulfilled" && typeof solRes.value?.result?.value === "number"
      ? solRes.value.result.value / 1_000_000_000
      : null;

  const irysLamports =
    irysRes.status === "fulfilled" && irysRes.value?.balance != null
      ? Number(irysRes.value.balance)
      : null;

  const irysSol = irysLamports != null ? irysLamports / 1_000_000_000 : null;
  const low = isTreasuryLow(sol, irysSol);

  const now = Date.now();
  if (low && (!lastWasLow || now - lastAlertAt > ALERT_DEBOUNCE_MS)) {
    lastAlertAt = now;
    notifyEvent({
      kind: "treasury_low",
      emoji: "🚨",
      title: "Treasury empty — uploads will fail",
      fields: {
        address: TREASURY,
        sol: sol ?? "n/a",
        irysSol: irysSol ?? "n/a",
        topUp: `https://solscan.io/account/${TREASURY}`,
      },
    });
  } else if (!low && lastWasLow) {
    notifyEvent({
      kind: "treasury_recovered",
      emoji: "✅",
      title: "Treasury topped up",
      fields: { address: TREASURY, sol: sol ?? "n/a", irysSol: irysSol ?? "n/a" },
    });
  }
  lastWasLow = low;

  return NextResponse.json(
    { address: TREASURY, sol, irysSol, low },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}
