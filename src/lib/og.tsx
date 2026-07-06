import { ImageResponse } from "next/og";

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

const FONT_CDN = "https://cdn.jsdelivr.net/npm";
const FONTS = {
  interRegular: `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff`,
  interBold: `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff`,
  interExtraBold: `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-800-normal.woff`,
};

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function fetchLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/icon-512.png`, { cache: "force-cache" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** A branded 1200×630 feature card used as the OG image for product pages. */
export async function featureOgImage(opts: {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta?: string;
}) {
  const [logo, interReg, interBold, interExtra] = await Promise.all([
    fetchLogo(),
    fetchFont(FONTS.interRegular),
    fetchFont(FONTS.interBold),
    fetchFont(FONTS.interExtraBold),
  ]);

  const fonts = [
    interReg && { name: "Inter", data: interReg, weight: 400 as const, style: "normal" as const },
    interBold && { name: "Inter", data: interBold, weight: 700 as const, style: "normal" as const },
    interExtra && { name: "Inter", data: interExtra, weight: 800 as const, style: "normal" as const },
  ].filter(Boolean) as Array<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" }>;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a14 0%, #1a0b2e 50%, #2a0e1f 100%)",
          color: "white",
          fontFamily: "Inter",
          padding: "64px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: "-200px",
            right: "-200px",
            width: "600px",
            height: "600px",
            background: "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "-200px",
            left: "-200px",
            width: "600px",
            height: "600px",
            background: "radial-gradient(circle, rgba(251,146,60,0.25) 0%, transparent 70%)",
          }}
        />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "32px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          {logo && <img src={logo} alt="" width={48} height={48} style={{ borderRadius: "12px" }} />}
          <div style={{ display: "flex" }}>
            <span>sol</span>
            <span style={{ color: "#a855f7" }}>.new</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: "30px", color: "#fb923c", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
            {opts.eyebrow}
          </div>
          <div style={{ display: "flex", fontSize: "84px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: "1000px" }}>
            {opts.title}
          </div>
          <div style={{ display: "flex", fontSize: "32px", fontWeight: 400, color: "rgba(255,255,255,0.7)", marginTop: "24px", maxWidth: "920px", lineHeight: 1.35 }}>
            {opts.subtitle}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: "20px", color: "rgba(255,255,255,0.7)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span style={{ display: "flex" }}>@soldotnew</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 28px",
              borderRadius: "999px",
              background: "linear-gradient(90deg, #a855f7 0%, #fb923c 100%)",
              fontSize: "22px",
              fontWeight: 700,
              color: "white",
            }}
          >
            {opts.cta ?? "Try it free →"}
          </div>
        </div>
      </div>
    ),
    { ...ogSize, fonts }
  );
}
