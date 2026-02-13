import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "No image" }, { status: 400 });

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
