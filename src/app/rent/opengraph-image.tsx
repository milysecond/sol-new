import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Live Solana rent on sol.new";
export const size = ogSize;
export const contentType = ogContentType;
export const revalidate = 60;

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

function fmtSol(n: number) {
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} SOL`;
}

function fmtUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

async function liveRent(): Promise<{
  ataSol: string;
  ataUsd: string;
  solUsd: string;
} | null> {
  try {
    const r = await fetch(`${API_BASE}/api/rent`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as {
      rentInSol?: number;
      rentInUsd?: number | null;
      price?: number;
      tokenAccount?: { sol?: number; usd?: number | null };
    };
    const sol = Number(d.tokenAccount?.sol ?? d.rentInSol);
    const usd = Number(d.tokenAccount?.usd ?? d.rentInUsd);
    const price = Number(d.price);
    if (!Number.isFinite(sol) || sol <= 0) return null;
    return {
      ataSol: fmtSol(sol),
      ataUsd: fmtUsd(Number.isFinite(usd) ? usd : null),
      solUsd: Number.isFinite(price) && price > 0 ? fmtUsd(price) : "-",
    };
  } catch {
    return null;
  }
}

export default async function Image() {
  const live = await liveRent();
  return featureOgImage({
    eyebrow: "Rent",
    title: live && live.ataUsd !== "-" ? live.ataUsd : live?.ataSol ?? "Minimum rent",
    subtitle: "Token account rent-exempt minimum. Close empty accounts and get it back.",
    cta: "Reclaim rent",
    accent: "cyan",
    path: "sol.new/rent",
    stats: live
      ? [
          { label: "ATA", value: live.ataSol },
          { label: "SOL", value: live.solUsd },
        ]
      : undefined,
  });
}
