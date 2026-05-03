import { ImageResponse } from "next/og";

export const alt = "Token launched on sol.new";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

const FONT_CDN = "https://cdn.jsdelivr.net/npm";
const FONTS = {
  interRegular:    `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff`,
  interBold:       `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff`,
  interExtraBold:  `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-800-normal.woff`,
  mono:            `${FONT_CDN}/@fontsource/jetbrains-mono@5.0.18/files/jetbrains-mono-latin-500-normal.woff`,
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

async function fetchImageDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  let target = url;
  if (target.startsWith("ipfs://")) {
    target = target.replace("ipfs://", "https://nftstorage.link/ipfs/");
  }
  // Local dev — Satori can't reach https://localhost:* — rewrite to http
  if (process.env.NODE_ENV !== "production") {
    target = target.replace(/^https:\/\/localhost(:\d+)?\//, "http://localhost$1/");
  }
  try {
    const res = await fetch(target, { cache: "no-store" });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${ctype};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "just now";
  const then = new Date(dateStr.includes("Z") ? dateStr : dateStr + "Z").getTime();
  if (Number.isNaN(then)) return "just now";
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2_592_000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2_592_000)}mo ago`;
}

export default async function OpengraphImage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;

  let name = "Token";
  let symbol = "";
  let rawImage: string | null = null;
  let createdAt: string | null = null;

  try {
    const res = await fetch(`${API_BASE}/api/token/${mint}`, { cache: "no-store" });
    if (res.ok) {
      const token = await res.json();
      name = token.name || name;
      symbol = token.symbol || "";
      rawImage = token.image_url ?? null;
      createdAt = token.created_at ?? null;
    }
  } catch {}

  const [imageDataUrl, logoDataUrl, interReg, interBold, interExtra, mono] = await Promise.all([
    fetchImageDataUrl(rawImage),
    fetchImageDataUrl(`${API_BASE}/icon-512.png`),
    fetchFont(FONTS.interRegular),
    fetchFont(FONTS.interBold),
    fetchFont(FONTS.interExtraBold),
    fetchFont(FONTS.mono),
  ]);

  const fontList = [
    interReg && { name: "Inter", data: interReg, weight: 400 as const, style: "normal" as const },
    interBold && { name: "Inter", data: interBold, weight: 700 as const, style: "normal" as const },
    interExtra && { name: "Inter", data: interExtra, weight: 800 as const, style: "normal" as const },
    mono && { name: "JetBrainsMono", data: mono, weight: 500 as const, style: "normal" as const },
  ].filter(Boolean) as Array<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 800 | 500; style: "normal" }>;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0a0a14 0%, #1a0b2e 50%, #2a0e1f 100%)",
          color: "white",
          fontFamily: "Inter",
          padding: "48px",
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
            background:
              "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)",
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
            background:
              "radial-gradient(circle, rgba(251,146,60,0.25) 0%, transparent 70%)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              fontSize: "32px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {logoDataUrl && (
              <img
                src={logoDataUrl}
                alt=""
                width={48}
                height={48}
                style={{ borderRadius: "12px" }}
              />
            )}
            <div style={{ display: "flex" }}>
              <span>sol</span>
              <span style={{ color: "#a855f7" }}>.new</span>
            </div>
            <span
              style={{
                fontSize: "20px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              · new launch
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 18px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              fontSize: "20px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            {timeAgo(createdAt)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: "56px",
          }}
        >
          {imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt=""
              width={360}
              height={360}
              style={{
                borderRadius: "32px",
                objectFit: "cover",
                boxShadow: "0 20px 60px rgba(168,85,247,0.4)",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: "360px",
                height: "360px",
                borderRadius: "32px",
                background:
                  "linear-gradient(135deg, #a855f7 0%, #fb923c 100%)",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "120px",
                fontWeight: 800,
                boxShadow: "0 20px 60px rgba(168,85,247,0.4)",
              }}
            >
              {(symbol.slice(0, 3) || "?").toUpperCase()}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: "36px",
                color: "#fb923c",
                fontWeight: 700,
                letterSpacing: "0.05em",
                marginBottom: "8px",
              }}
            >
              ${symbol.toUpperCase() || "TKN"}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "78px",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: "20px",
                padding: "10px 18px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: "18px",
                fontFamily: "JetBrainsMono",
                fontWeight: 500,
                color: "rgba(255,255,255,0.75)",
                alignSelf: "flex-start",
                letterSpacing: "-0.01em",
              }}
            >
              {mint}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: "24px",
            marginTop: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "22px",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Create anything on Solana · instant · low fees
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
            Launch yours →
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fontList }
  );
}
