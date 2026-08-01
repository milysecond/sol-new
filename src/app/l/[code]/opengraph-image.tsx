import { featureOgImage, ogSize, ogContentType } from "@/lib/og";
import { initDb, getShortLink } from "@/lib/db";
import {
  describeShortLinkDestination,
  normalizeCode,
  shortLinkDisplayTitle,
  shortPath,
} from "@/lib/short-link";

export const alt = "sol.new short link";
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw || "");

  let title = "Short link";
  let subtitle = "Shared via sol.new";
  let path = code ? `sol.new${shortPath(code)}` : "sol.new/link";

  try {
    if (code) {
      await initDb();
      const link = await getShortLink(code);
      if (link) {
        const dest = describeShortLinkDestination(link.targetUrl);
        title = shortLinkDisplayTitle(link.title, dest);
        const opens =
          link.clicks > 0 ? ` · ${link.clicks.toLocaleString()} opens` : "";
        subtitle = `${dest.siteName} · ${dest.kind}${opens}`.slice(0, 120);
        path = `sol.new${shortPath(code)}`;
      }
    }
  } catch {
    /* fall through to defaults */
  }

  return featureOgImage({
    eyebrow: "Short link",
    title: title.length > 48 ? `${title.slice(0, 45)}…` : title,
    subtitle,
    cta: "Open link",
    accent: "cyan",
    path,
  });
}
