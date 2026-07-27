import { ImageResponse } from "next/og";
import { ogSize, ogContentType } from "@/lib/og";

export const alt = "Solana transaction receipt";
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "edge";

function shortSig(s: string) {
  if (s.length <= 20) return s;
  return `${s.slice(0, 8)}…${s.slice(-8)}`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ signature: string }>;
}) {
  const { signature } = await params;
  const display = shortSig(signature || "unknown");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a14 0%, #1a0b2e 50%, #0f1f1a 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          padding: "64px",
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
            background: "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
            marginBottom: 16,
          }}
        >
          sol.new · receipt
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          Transaction receipt
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 24,
            padding: "28px 32px",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "rgba(255,255,255,0.5)",
              marginBottom: 8,
            }}
          >
            Signature
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontFamily: "ui-monospace, monospace",
              color: "#c4b5fd",
            }}
          >
            {display}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 20,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Verified on sol.new
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
