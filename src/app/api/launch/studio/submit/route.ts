import { NextRequest, NextResponse } from "next/server";
import { jupStudioConfigured, studioSubmit } from "@/lib/jup-studio";

export async function POST(req: NextRequest) {
  try {
    if (!jupStudioConfigured()) {
      return NextResponse.json({ error: "Jupiter Studio API key not set" }, { status: 503 });
    }
    const incoming = await req.formData();
    const transaction = incoming.get("transaction");
    const owner = incoming.get("owner");
    if (typeof transaction !== "string" || typeof owner !== "string") {
      return NextResponse.json({ error: "Missing signed transaction or owner" }, { status: 400 });
    }
    const form = new FormData();
    form.append("transaction", transaction);
    form.append("owner", owner);
    const content = incoming.get("content");
    if (typeof content === "string") form.append("content", content);
    const data = await studioSubmit(form);
    return NextResponse.json({ ok: true, result: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
