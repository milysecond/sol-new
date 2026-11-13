import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { initDb, db } from "@/lib/db";
import PoapClaimClient from "./poap-claim-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function dropExists(code: string): Promise<{ ok: boolean; title?: string }> {
  const c = (code || "").trim().toLowerCase();
  if (!c || c.length > 64) return { ok: false };
  try {
    await initDb();
    const r = await db.execute({
      sql: "SELECT title FROM poap_drops WHERE lower(code) = ? LIMIT 1",
      args: [c],
    });
    const row = r.rows?.[0] as { title?: string } | undefined;
    if (!row) return { ok: false };
    return { ok: true, title: row.title || c };
  } catch {
    // DB blip — let client page handle (don't hard-404 live drops)
    return { ok: true, title: c };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const d = await dropExists(code);
  if (!d.ok) {
    return {
      title: "POAP not found — sol.new",
      robots: { index: false, follow: false },
    };
  }
  const title = `${d.title} · POAP — sol.new`;
  const description = "Claim this event POAP on sol.new";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://sol.new/poap/${encodeURIComponent(code)}`,
      siteName: "sol.new",
      type: "website",
      images: [{ url: "https://sol.new/poap/opengraph-image", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["https://sol.new/poap/opengraph-image"],
    },
    robots: { index: true, follow: true },
  };
}

export default async function PoapCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const d = await dropExists(code);
  if (!d.ok) notFound();
  return <PoapClaimClient />;
}
