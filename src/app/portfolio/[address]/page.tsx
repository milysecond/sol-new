import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { PortfolioAddressClient } from "./portfolio-address-client";

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
    title: `Portfolio ${short} — sol.new`,
    description: `Token balances and Jupiter DeFi positions for ${short}.`,
    path: `/portfolio/${encodeURIComponent(address)}`,
  });
}

export default async function PortfolioAddressPage({ params }: Props) {
  const { address: raw } = await params;
  let address = raw;
  try {
    address = decodeURIComponent(raw);
  } catch {
    /* keep */
  }
  return <PortfolioAddressClient address={address} />;
}
