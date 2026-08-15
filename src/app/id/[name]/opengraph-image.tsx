import { ImageResponse } from "next/og";

export const alt = "Solana name on sol.new";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_CDN = "https://cdn.jsdelivr.net/npm";
const FONTS = {
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

function shortAddr(a: string) {
  if (!a || a.length <= 16) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

function kindFromTld(tld?: string | null): string {
  if (tld === "sol") return "SNS · .sol";
  if (tld === "sns") return "SNS · .sns";
  if (tld === "skr") return "ADNS · .skr";
  if (tld === "bonk") return "ADNS · .bonk";
  return "Solana name";
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: raw } = await params;
  let name = raw;
  try {
    name = decodeURIComponent(raw).trim();
  } catch {
    /* keep */
  }

  const lower = name.toLowerCase();
  const hasDot = lower.includes(".");
  const tryNames = hasDot
    ? [lower]
    : [`${lower}.sol`, `${lower}.sns`, `${lower}.skr`, `${lower}.bonk`];

  let domain = lower;
  let owner = "";
  let kind = "Solana name";
  let tld: string | null = null;

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";
  for (const n of tryNames) {
    try {
      const res = await fetch(`${base}/api/resolve?name=${encodeURIComponent(n)}`, {
        next: { revalidate: 300 },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        owner?: string;
        domain?: string;
        tld?: string;
        kind?: string;
        resolvedAs?: string;
      };
      if (res.ok && data.ok && data.owner) {
        domain = data.resolvedAs || data.domain || n;
        owner = data.owner;
        tld = data.tld || null;
        kind = kindFromTld(tld);
        break;
      }
    } catch {
      /* next */
    }
  }

  const [bold, extra, mono] = await Promise.all([
    fetchFont(FONTS.interBold),
    fetchFont(FONTS.interExtraBold),
    fetchFont(FONTS.mono),
  ]);

  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: "normal" }[] =
    [];
  if (bold) fonts.push({ name: "Inter", data: bold, weight: 700, style: "normal" });
  if (extra) fonts.push({ name: "Inter", data: extra, weight: 800, style: "normal" });
  if (mono) fonts.push({ name: "JetBrains Mono", data: mono, weight: 500, style: "normal" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(145deg, #0a0a0f 0%, #1a1030 55%, #0f172a 100%)",
          color: "white",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg, #a855f7, #7c3aed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            id
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 22, fontWeight: 700, opacity: 0.9 }}>sol.new</span>
            <span style={{ fontSize: 16, opacity: 0.5 }}>{kind}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: domain.length > 28 ? 48 : 64,
              fontWeight: 800,
              letterSpacing: -1,
              lineHeight: 1.05,
            }}
          >
            {domain}
          </div>
          {owner ? (
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 28,
                opacity: 0.75,
              }}
            >
              {shortAddr(owner)}
            </div>
          ) : (
            <div style={{ fontSize: 24, opacity: 0.5 }}>Name lookup on Solana</div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            opacity: 0.7,
          }}
        >
          <span>Portfolio · Send · Address</span>
          <span style={{ color: "#c084fc", fontWeight: 700 }}>sol.new/id</span>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
