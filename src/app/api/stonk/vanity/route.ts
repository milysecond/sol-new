import { NextResponse } from "next/server";
import { initDb, claimGroundKey, releaseGroundKey } from "@/lib/db";
import { claimStnkMint, releaseStnkMint } from "@/lib/stnk-pool";

export type VanityKind = "STNK" | "NEW" | "random";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { kind?: string; releaseMint?: string };
    const kind = body.kind as VanityKind;
    if (body.releaseMint && (kind === "NEW" || kind === "STNK")) {
      if (kind === "NEW") await releaseGroundKey(body.releaseMint).catch(() => {});
      else await releaseStnkMint(body.releaseMint).catch(() => {});
      return NextResponse.json({ ok: true });
    }
    if (kind === "NEW") {
      await initDb().catch(() => {});
      const key = await claimGroundKey("NEW");
      if (!key) return NextResponse.json({ ok: false, error: "No NEW mints left" }, { status: 503 });
      return NextResponse.json({ ok: true, mint: key.publicKey, secretKey: key.secretKey });
    }
    if (kind === "STNK") {
      const key = await claimStnkMint();
      if (!key) return NextResponse.json({ ok: false, error: "No STNK mints left" }, { status: 503 });
      return NextResponse.json({ ok: true, mint: key.publicKey, secretKey: key.secretKey });
    }
    return NextResponse.json({ ok: false, error: "Pick STNK or NEW" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
