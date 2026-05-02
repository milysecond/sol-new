import { NextResponse } from "next/server";
import { initDb, getMetadata } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> }
) {
  const { file } = await ctx.params;
  const id = file.endsWith(".json") ? file.slice(0, -5) : file;
  if (!/^[a-f0-9]{16}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await initDb();
  const json = await getMetadata(id);
  if (!json) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(json, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
    },
  });
}
