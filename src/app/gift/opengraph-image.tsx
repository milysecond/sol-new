import { ImageResponse } from "next/og";
import { ogSize, ogContentType } from "@/lib/og";

export const alt = "Send crypto with a link on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

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

/** Send-side gift OG — same visual language as claim. */
export default async function Image() {
  const logo = await fetchLogo();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(145deg, #0c0a12 0%, #1a0a2e 38%, #2d1054 72%, #451a6b 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "52px 64px",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            top: -120,
            right: -80,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(251,191,36,0.4) 0%, transparent 68%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            display: "flex",
            bottom: -160,
            left: -100,
            width: 480,
            height: 480,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={52} height={52} style={{ borderRadius: 14 }} />
          )}
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>
            <span>sol</span>
            <span style={{ color: "#c084fc" }}>.new</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            maxWidth: 900,
          }}
        >
          <div
            style={{
              display: "flex",
              marginBottom: 18,
              padding: "10px 18px",
              borderRadius: 999,
              background: "rgba(251,191,36,0.15)",
              border: "1px solid rgba(251,191,36,0.35)",
              alignSelf: "flex-start",
              fontSize: 22,
              fontWeight: 700,
              color: "#fbbf24",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Crypto gifts
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            <span>Send SOL or USDC</span>
            <span style={{ color: "#fbbf24" }}>with a link</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 28,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.35,
              maxWidth: 720,
            }}
          >
            They claim with Face ID. No wallet download required.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
            sol.new/gift
          </div>
          <div
            style={{
              display: "flex",
              padding: "16px 36px",
              borderRadius: 999,
              background: "linear-gradient(90deg, #fbbf24 0%, #f472b6 50%, #a855f7 100%)",
              fontSize: 26,
              fontWeight: 800,
              color: "#0c0a12",
              boxShadow: "0 12px 40px rgba(168,85,247,0.45)",
            }}
          >
            Create a gift link
          </div>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
