import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { IdNameClient } from "./id-name-client";

type Props = { params: Promise<{ name: string }> };

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name: raw } = await params;
  const name = decodeName(raw);
  const display = name || "name";
  return pageMeta({
    title: `${display} — sol.new/id`,
    description: `Resolve ${display} on Solana (.sol · .sns · .bonk · .skr) and open portfolio.`,
    path: `/id/${encodeURIComponent(name)}`,
  });
}

export default async function IdNamePage({ params }: Props) {
  const { name: raw } = await params;
  const name = decodeName(raw);
  return <IdNameClient name={name} />;
}
