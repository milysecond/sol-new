import { NextRequest, NextResponse } from "next/server";
import { initDb, saveNft, getWalletNfts } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const data = await req.json();
    if (!data.wallet || !data.name)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const id = await saveNft(data);
    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    const result = await getWalletNfts(wallet);
    return NextResponse.json({ nfts: result.rows }, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
