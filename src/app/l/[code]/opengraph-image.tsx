import { ImageResponse } from "next/og";
import { featureOgImage, ogSize, ogContentType, fetchLogo } from "@/lib/og";
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

async function fetchFaviconDataUrl(hostname: string): Promise<string | null> {
  if (!hostname) return null;
  const urls = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: "force-cache",
        headers: { "User-Agent": "sol.new-og/1.0" },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 32 || buf.byteLength > 200_000) continue;
      const ct = res.headers.get("content-type") || "image/png";
      if (!ct.startsWith("image/")) continue;
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return null;
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw || "");

  // Missing / unknown → generic brand card
  if (!code) {
    return featureOgImage({
      eyebrow: "Short link",
      title: "sol.new/link",
      subtitle: "Free short URLs for Solana & the open web",
      cta: "Create a link",
      accent: "cyan",
      path: "sol.new/link",
    });
  }

  try {
    await initDb();
    const link = await getShortLink(code);
    if (!link) {
      return featureOgImage({
        eyebrow: "Short link",
        title: shortPath(code),
        subtitle: "Link not found · create one at sol.new/link",
        cta: "Create a link",
        accent: "cyan",
        path: `sol.new${shortPath(code)}`,
      });
    }

    const dest = describeShortLinkDestination(link.targetUrl);
    const title = shortLinkDisplayTitle(link.title, dest);
    const pathLabel = `sol.new${shortPath(code)}`;
    let destPath = "";
    try {
      const u = new URL(link.targetUrl);
      destPath = `${u.pathname}${u.search}`.slice(0, 64);
      if (destPath.length >= 64) destPath = `${destPath.slice(0, 61)}…`;
    } catch {
      /* ignore */
    }

    const [logo, favicon] = await Promise.all([
      fetchLogo(),
      fetchFaviconDataUrl(dest.hostname),
    ]);

    const opens =
      link.clicks > 0 ? `${link.clicks.toLocaleString()} opens` : "New short link";

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "#050508",
            color: "white",
            fontFamily: "Inter, system-ui, sans-serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* cyan glow */}
          <div
            style={{
              position: "absolute",
              top: -120,
              right: -80,
              width: 480,
              height: 480,
              borderRadius: 999,
              background: "rgba(6,182,212,0.28)",
              filter: "blur(80px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -160,
              left: -100,
              width: 420,
              height: 420,
              borderRadius: 999,
              background: "rgba(168,85,247,0.18)",
              filter: "blur(90px)",
            }}
          />

          {/* top bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "36px 56px 0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} width={48} height={48} style={{ borderRadius: 12 }} alt="" />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "#06b6d4",
                  }}
                />
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
                  sol.new
                </span>
                <span style={{ fontSize: 14, color: "rgba(103,232,249,0.9)", fontWeight: 600 }}>
                  Short link
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid rgba(6,182,212,0.35)",
                background: "rgba(6,182,212,0.12)",
                fontSize: 18,
                fontWeight: 600,
                color: "rgba(165,243,252,0.95)",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {pathLabel}
            </div>
          </div>

          {/* main card */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "28px 56px 48px",
              gap: 28,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                padding: "32px 36px",
                borderRadius: 28,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: 28,
                  background: "rgba(255,255,255,0.95)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                {favicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={favicon}
                    width={72}
                    height={72}
                    style={{ borderRadius: 16 }}
                    alt=""
                  />
                ) : (
                  <span style={{ fontSize: 42, fontWeight: 800, color: "#0f172a" }}>
                    {(dest.siteName || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "rgba(103,232,249,0.95)",
                      textTransform: "uppercase",
                      letterSpacing: 1.2,
                    }}
                  >
                    {dest.kind}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
                  <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)" }}>{opens}</span>
                </div>
                <div
                  style={{
                    fontSize: title.length > 40 ? 40 : 48,
                    fontWeight: 800,
                    letterSpacing: -1.2,
                    lineHeight: 1.1,
                    maxWidth: 820,
                  }}
                >
                  {title.length > 56 ? `${title.slice(0, 53)}…` : title}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                    {dest.siteName}
                  </span>
                  <span
                    style={{
                      fontSize: 20,
                      color: "rgba(103,232,249,0.85)",
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {dest.host}
                    {destPath && destPath !== "/" ? destPath : ""}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.45)" }}>
                {dest.summary.slice(0, 90)}
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 28px",
                  borderRadius: 999,
                  background: "#06b6d4",
                  color: "#042f2e",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                {dest.continueLabel}
              </div>
            </div>
          </div>
        </div>
      ),
      { ...ogSize }
    );
  } catch {
    return featureOgImage({
      eyebrow: "Short link",
      title: shortPath(code),
      subtitle: "Shared via sol.new",
      cta: "Open link",
      accent: "cyan",
      path: `sol.new${shortPath(code)}`,
    });
  }
}
