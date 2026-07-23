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

export type OgAccent = "purple" | "orange" | "green" | "blue" | "pink" | "cyan";

const ACCENTS: Record<
  OgAccent,
  { solid: string; soft: string; glow: string; label: string }
> = {
  purple: {
    solid: "#a855f7",
    soft: "rgba(168,85,247,0.55)",
    glow: "rgba(168,85,247,0.4)",
    label: "rgba(216,180,254,0.95)",
  },
  orange: {
    solid: "#f97316",
    soft: "rgba(249,115,22,0.5)",
    glow: "rgba(249,115,22,0.35)",
    label: "rgba(253,186,116,0.95)",
  },
  green: {
    solid: "#22c55e",
    soft: "rgba(34,197,94,0.45)",
    glow: "rgba(34,197,94,0.32)",
    label: "rgba(134,239,172,0.95)",
  },
  blue: {
    solid: "#3b82f6",
    soft: "rgba(59,130,246,0.5)",
    glow: "rgba(59,130,246,0.35)",
    label: "rgba(147,197,253,0.95)",
  },
  pink: {
    solid: "#d946ef",
    soft: "rgba(217,70,239,0.5)",
    glow: "rgba(217,70,239,0.35)",
    label: "rgba(240,171,252,0.95)",
  },
  cyan: {
    solid: "#06b6d4",
    soft: "rgba(6,182,212,0.45)",
    glow: "rgba(6,182,212,0.32)",
    label: "rgba(103,232,249,0.95)",
  },
};

async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function fetchLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/icon-512.png`, { cache: "force-cache" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadFonts() {
  const [interReg, interBold, interExtra] = await Promise.all([
    fetchFont(FONTS.interRegular),
    fetchFont(FONTS.interBold),
    fetchFont(FONTS.interExtraBold),
  ]);
  return [
    interReg && { name: "Inter", data: interReg, weight: 400 as const, style: "normal" as const },
    interBold && { name: "Inter", data: interBold, weight: 700 as const, style: "normal" as const },
    interExtra && { name: "Inter", data: interExtra, weight: 800 as const, style: "normal" as const },
  ].filter(Boolean) as Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700 | 800;
    style: "normal";
  }>;
}

/**
 * Premium dark 1200×630 feature card. Shared visual language for product OGs.
 * No emoji. Tight type. Accent bar + single glow.
 */
export async function featureOgImage(opts: {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta?: string;
  accent?: OgAccent;
  /** Small path shown under brand, e.g. sol.new/token */
  path?: string;
}) {
  const accent = ACCENTS[opts.accent || "purple"];
  const [logo, fonts] = await Promise.all([fetchLogo(), loadFonts()]);

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
        {/* Ambient glows */}
        <div
          style={{
            position: "absolute",
            display: "flex",
            top: -180,
            right: -120,
            width: 640,
            height: 640,
            borderRadius: 999,
            background: `radial-gradient(circle, ${accent.glow} 0%, transparent 68%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            display: "flex",
            bottom: -220,
            left: -160,
            width: 560,
            height: 560,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)",
          }}
        />

        {/* Left accent rail */}
        <div
          style={{
            position: "absolute",
            display: "flex",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            background: accent.solid,
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "56px 72px 48px 80px",
            position: "relative",
          }}
        >
          {/* Brand row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt=""
                  width={52}
                  height={52}
                  style={{ borderRadius: 14 }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: accent.solid,
                  }}
                />
              )}
              <div
                style={{
                  display: "flex",
                  fontSize: 34,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                }}
              >
                <span>sol</span>
                <span style={{ color: accent.solid }}>.new</span>
              </div>
            </div>
            {opts.path && (
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "-0.01em",
                }}
              >
                {opts.path}
              </div>
            )}
          </div>

          {/* Body */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "center",
              paddingTop: 24,
              paddingBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 36,
                  height: 3,
                  borderRadius: 2,
                  background: accent.solid,
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: accent.label,
                }}
              >
                {opts.eyebrow}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.035em",
                maxWidth: 980,
              }}
            >
              {opts.title}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 400,
                color: "rgba(255,255,255,0.62)",
                marginTop: 22,
                maxWidth: 860,
                lineHeight: 1.35,
              }}
            >
              {opts.subtitle}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              paddingTop: 28,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 20,
                fontWeight: 500,
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Passkey-secured Solana tools
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "14px 30px",
                borderRadius: 999,
                background: accent.solid,
                fontSize: 22,
                fontWeight: 700,
                color: "white",
                letterSpacing: "-0.01em",
              }}
            >
              {opts.cta ?? "Open sol.new"}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...ogSize, fonts },
  );
}

/** Default homepage / brand OG. */
export async function brandOgImage(opts?: { subtitle?: string }) {
  return featureOgImage({
    eyebrow: "sol.new",
    title: "Create on Solana",
    subtitle:
      opts?.subtitle ??
      "Tokens, NFTs, wallets, pay, gifts, and more. Face ID. No seed phrases.",
    cta: "Start free",
    accent: "purple",
    path: "sol.new",
  });
}
