import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ address: string }> };

function shortAddr(a: string) {
  const s = a.trim();
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address: raw } = await params;
  let address = raw;
  try {
    address = decodeURIComponent(raw);
  } catch {
    /* keep */
  }
  const short = shortAddr(address);
  const path = `/address/${address}`;
  const ogImage = `https://sol.new/address/${encodeURIComponent(address)}/opengraph-image`;

  // Best-effort live title from scan
  let title = `${short} — sol.new`;
  let description = `Look up Solana address ${short} on sol.new.`;
  try {
    const res = await fetch(
      `https://sol.new/api/scan?address=${encodeURIComponent(address)}`,
      { next: { revalidate: 300 } },
    );
    if (res.ok) {
      const d = (await res.json()) as {
        type?: string;
        name?: string;
        symbol?: string;
        ageRelative?: string;
      };
      if (d.type === "token" && d.name) {
        title = `${d.name}${d.symbol ? ` ($${d.symbol})` : ""} — sol.new`;
        description = [
          `Token mint ${short}`,
          d.ageRelative ? `· age ${d.ageRelative} (on-chain)` : null,
        ]
          .filter(Boolean)
          .join(" ");
      } else if (d.type === "program") {
        title = `Program ${short} — sol.new`;
        description = `Solana program ${short}`;
      } else if (d.type === "wallet") {
        title = `Wallet ${short} — sol.new`;
        description = `Solana wallet ${short}`;
      }
    }
  } catch {
    /* ignore */
  }

  return pageMeta({
    title,
    description,
    path,
    image: ogImage,
  });
}

/**
 * Pretty URL shell. Middleware rewrites `/address/<pk>` → `/scan?address=<pk>`
 * so the scan UI renders while the browser keeps `/address/…`.
 */
export default function AddressPage() {
  return null;
}
