import { NextRequest, NextResponse } from "next/server";
import { initDb, createPromoCode, db } from "@/lib/db";

export const dynamic = "force-dynamic";

function auth(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return secret && secret === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const codes = await db.execute(
    `SELECT c.code, c.uses_remaining, c.uses_total, c.description, c.created_at, c.expires_at,
            COUNT(r.id) as redemptions
     FROM promo_codes c
     LEFT JOIN promo_redemptions r ON r.code = c.code
     GROUP BY c.code
     ORDER BY c.created_at DESC
     LIMIT 200`
  );
  const redemptions = await db.execute(
    `SELECT code, wallet, kind, redeemed_at FROM promo_redemptions ORDER BY redeemed_at DESC LIMIT 100`
  );
  return NextResponse.json({ codes: codes.rows, redemptions: redemptions.rows });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code, uses = 1, description, expiresAt, count = 1 } = (await req.json().catch(() => ({}))) as {
    code?: string;
    uses?: number;
    description?: string;
    expiresAt?: string;
    count?: number;
  };
  await initDb();
  const codes: string[] = [];
  for (let i = 0; i < Math.min(count, 100); i++) {
    codes.push(await createPromoCode({ code: count === 1 ? code : undefined, uses, description, expiresAt }));
  }
  return NextResponse.json({ codes });
}
