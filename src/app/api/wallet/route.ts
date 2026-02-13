import { NextRequest, NextResponse } from "next/server";
import { initDb, saveWallet } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const { publicKey, credentialId } = await req.json();
    if (!publicKey) return NextResponse.json({ error: "Missing publicKey" }, { status: 400 });
    await saveWallet(publicKey, credentialId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
