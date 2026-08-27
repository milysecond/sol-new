import { ImageResponse } from "next/og";

export const alt = "Solana address on sol.new";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

const FONT_CDN = "https://cdn.jsdelivr.net/npm";
const FONTS = {
  interRegular: `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff`,
  interBold: `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff`,
  interExtraBold: `${FONT_CDN}/@fontsource/inter@5.0.16/files/inter-latin-800-normal.woff`,
  mono: `${FONT_CDN}/@fontsource/jetbrains-mono@5.0.18/files/jetbrains-mono-latin-500-normal.woff`,
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
  try {
    const res = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "image/png";
    if (!ctype.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Cap ~1.5MB for Satori
    if (buf.length > 1_500_000) return null;
    return `data:${ctype};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function shortAddr(a: string) {
  if (a.length <= 16) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

type ScanPayload = {
  type?: string;
  addressType?: string;
  address?: string;
  name?: string;
  symbol?: string;
  imageUrl?: string | null;
  createdAt?: string | null;
  ageRelative?: string | null;
  ageAbsolute?: string | null;
  tokenProgram?: string | null;
  sol?: number;
  usdc?: number | null;
};

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: raw } = await params;
  let address = raw;
  try {
    address = decodeURIComponent(raw);
  } catch {
    /* keep */
  }

  let scan: ScanPayload = {};
  try {
    const res = await fetch(
      `${API_BASE}/api/scan?address=${encodeURIComponent(address)}`,
      { cache: "no-store", signal: AbortSignal.timeout(20_000) },
    );
    if (res.ok) scan = (await res.json()) as ScanPayload;
  } catch {
    /* ignore */
  }

  const kind =
    scan.type === "token"
      ? "Token mint"
      : scan.type === "token_account"
        ? "Token account"
        : scan.type === "program"
          ? "Program"
          : "Wallet";

  const title =
    scan.type === "token" && scan.name
      ? scan.name
      : shortAddr(address);
  const subtitle =
    scan.type === "token" && scan.symbol
      ? `$${scan.symbol}`
      : kind;

  const ageLine =
    scan.ageRelative && scan.ageRelative !== "unknown"
      ? scan.ageRelative
      : null;
  const ageAbs = scan.ageAbsolute || null;

  const [imageDataUrl, logoDataUrl, interReg, interBold, interExtra, mono] =
    await Promise.all([
      fetchImageDataUrl(scan.imageUrl ?? null),
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
  ].filter(Boolean) as Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700 | 800 | 500;
    style: "normal";
  }>;

  const accent =
    scan.type === "token"
      ? "#fb923c"
      : scan.type === "program"
        ? "#a855f7"
        : "#38bdf8";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a14 0%, #1a0b2e 55%, #0f172a 100%)",
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
            top: "-180px",
            right: "-120px",
            width: "520px",
            height: "520px",
            background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)`,
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
              gap: "14px",
              fontSize: "30px",
              fontWeight: 700,
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
            <span style={{ fontSize: "18px", color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
              · address
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                padding: "10px 16px",
                borderRadius: "999px",
                background: `${accent}22`,
                border: `1px solid ${accent}66`,
                fontSize: "18px",
                fontWeight: 700,
                color: accent,
              }}
            >
              {kind}
            </div>
            {ageLine && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  padding: "8px 14px",
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ display: "flex", fontSize: "18px", fontWeight: 700 }}>
                  {ageLine}
                </div>
                {ageAbs && (
                  <div
                    style={{
                      display: "flex",
                      fontSize: "12px",
                      fontFamily: "JetBrainsMono",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {ageAbs}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: "48px",
            marginTop: "12px",
          }}
        >
          {imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt=""
              width={280}
              height={280}
              style={{
                borderRadius: "28px",
                objectFit: "cover",
                boxShadow: `0 16px 48px ${accent}55`,
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: "280px",
                height: "280px",
                borderRadius: "28px",
                background: `linear-gradient(135deg, ${accent} 0%, #a855f7 100%)`,
                alignItems: "center",
                justifyContent: "center",
                fontSize: "88px",
                fontWeight: 800,
              }}
            >
              {(scan.symbol || kind).slice(0, 3).toUpperCase()}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                fontSize: "28px",
                color: accent,
                fontWeight: 700,
                marginBottom: "8px",
              }}
            >
              {subtitle}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "64px",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: "18px",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: "20px",
                fontFamily: "JetBrainsMono",
                color: "rgba(255,255,255,0.8)",
                alignSelf: "flex-start",
              }}
            >
              {address}
            </div>
            {scan.type === "wallet" && (
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  marginTop: "20px",
                  fontSize: "22px",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                <span style={{ display: "flex" }}>
                  ◎ {(scan.sol ?? 0).toFixed(4)} SOL
                </span>
                {scan.usdc != null && (
                  <span style={{ display: "flex" }}>
                    ${Number(scan.usdc).toFixed(2)} USDC
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: "20px",
            marginTop: "8px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <span style={{ display: "flex" }}>sol.new/address/… · on-chain age</span>
          <span style={{ display: "flex", color: "#a855f7", fontWeight: 700 }}>
            Look up →
          </span>
        </div>
      </div>
    ),
    { ...size, fonts: fontList },
  );
}
