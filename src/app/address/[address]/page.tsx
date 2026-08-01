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
  return pageMeta({
    title: `${short} — sol.new`,
    description: `Look up Solana wallet, token, or program ${short} on sol.new.`,
    path: `/address/${encodeURIComponent(address)}`,
  });
}

/**
 * Pretty URL shell. Middleware rewrites `/address/<pk>` → `/scan?address=<pk>`
 * so the scan UI renders while the browser keeps `/address/…`.
 */
export default function AddressPage() {
  return null;
}
