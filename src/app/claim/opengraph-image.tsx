import { ImageResponse } from "next/og";
import { ogSize, ogContentType } from "@/lib/og";

export const alt = "You've been sent crypto — claim it on sol.new";
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

/** Bold gift claim card for X / iMessage previews. */
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
        }}
      >
        {/* Glow orbs */}
        <div
          style={{
            position: "absolute",
            display: "flex",
            top: -120,
            right: -80,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(251,191,36,0.45) 0%, transparent 68%)",
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
        <div
          style={{
            position: "absolute",
            display: "flex",
            top: 180,
            left: 420,
            width: 280,
            height: 280,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(236,72,153,0.28) 0%, transparent 70%)",
          }}
        />

        {/* Soft confetti dots */}
        {[
          [80, 90],
          [180, 520],
          [980, 80],
          [1100, 400],
          [240, 200],
          [900, 280],
          [640, 60],
          [1050, 540],
        ].map(([x, y], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              display: "flex",
              left: x,
              top: y,
              width: i % 2 === 0 ? 14 : 10,
              height: i % 2 === 0 ? 14 : 10,
              borderRadius: 4,
              background:
                i % 3 === 0
                  ? "rgba(251,191,36,0.85)"
                  : i % 3 === 1
                    ? "rgba(232,121,249,0.8)"
                    : "rgba(167,139,250,0.85)",
              transform: `rotate(${i * 22}deg)`,
            }}
          />
        ))}

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "52px 64px",
            position: "relative",
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
                  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              <span>sol</span>
              <span style={{ color: "#c084fc" }}>.new</span>
            </div>
          </div>

          {/* Main row: copy + gift box */}
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "space-between",
              gap: 40,
              marginTop: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxWidth: 640,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
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
                Gift for you
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontSize: 72,
                  fontWeight: 800,
                  lineHeight: 1.02,
                  letterSpacing: "-0.035em",
                }}
              >
                <span>You&apos;ve been</span>
                <span style={{ color: "#fbbf24" }}>sent crypto</span>
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: 22,
                  fontSize: 28,
                  color: "rgba(255,255,255,0.72)",
                  lineHeight: 1.35,
                  maxWidth: 560,
                }}
              >
                Claim in seconds with Face ID. No app. No seed phrase.
              </div>
            </div>

            {/* Gift box visual */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 320,
                height: 320,
                position: "relative",
              }}
            >
              {/* Glow under box */}
              <div
                style={{
                  position: "absolute",
                  display: "flex",
                  bottom: 24,
                  width: 220,
                  height: 40,
                  borderRadius: 999,
                  background: "radial-gradient(ellipse, rgba(251,191,36,0.55) 0%, transparent 70%)",
                }}
              />
              {/* Box body */}
              <div
                style={{
                  display: "flex",
                  width: 200,
                  height: 150,
                  borderRadius: 20,
                  background: "linear-gradient(160deg, #fbbf24 0%, #f59e0b 45%, #d97706 100%)",
                  boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
                  position: "relative",
                  marginTop: 48,
                }}
              >
                {/* Vertical ribbon */}
                <div
                  style={{
                    position: "absolute",
                    display: "flex",
                    left: "50%",
                    top: 0,
                    bottom: 0,
                    width: 36,
                    marginLeft: -18,
                    background: "linear-gradient(180deg, #a855f7 0%, #7c3aed 100%)",
                  }}
                />
                {/* Horizontal ribbon */}
                <div
                  style={{
                    position: "absolute",
                    display: "flex",
                    top: "42%",
                    left: 0,
                    right: 0,
                    height: 36,
                    marginTop: -18,
                    background: "linear-gradient(90deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)",
                  }}
                />
              </div>
              {/* Lid */}
              <div
                style={{
                  display: "flex",
                  width: 230,
                  height: 48,
                  borderRadius: 12,
                  marginTop: -178,
                  background: "linear-gradient(180deg, #fde68a 0%, #fbbf24 60%, #f59e0b 100%)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    display: "flex",
                    left: "50%",
                    top: 0,
                    bottom: 0,
                    width: 36,
                    marginLeft: -18,
                    background: "linear-gradient(180deg, #c084fc 0%, #a855f7 100%)",
                    borderRadius: 4,
                  }}
                />
              </div>
              {/* Bow */}
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  top: 36,
                  left: "50%",
                  marginLeft: -48,
                  width: 96,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: "linear-gradient(135deg, #e879f9, #a855f7)",
                    marginRight: -8,
                    boxShadow: "0 4px 12px rgba(168,85,247,0.5)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: "linear-gradient(225deg, #e879f9, #7c3aed)",
                    marginLeft: -8,
                    boxShadow: "0 4px 12px rgba(168,85,247,0.5)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    display: "flex",
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* CTA footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: "rgba(255,255,255,0.55)",
                fontWeight: 500,
              }}
            >
              sol.new/claim
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 36px",
                borderRadius: 999,
                background: "linear-gradient(90deg, #fbbf24 0%, #f472b6 50%, #a855f7 100%)",
                fontSize: 26,
                fontWeight: 800,
                color: "#0c0a12",
                boxShadow: "0 12px 40px rgba(168,85,247,0.45)",
                letterSpacing: "-0.02em",
              }}
            >
              Claim your gift
            </div>
          </div>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
