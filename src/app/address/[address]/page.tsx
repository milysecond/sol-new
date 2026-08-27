import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import ScanPage from "@/app/scan/page";

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

  let title = `${short} — sol.new`;
  let description = `Look up Solana address ${short} on sol.new.`;
  try {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sol.new";
    const res = await fetch(
      `${base}/api/scan?address=${encodeURIComponent(address)}`,
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

/** Pretty URL — Scan UI reads address from pathname. */
export default async function AddressPage({ params }: Props) {
  await params; // ensure dynamic
  return <ScanPage />;
}
