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
  const path = `/id/${encodeURIComponent(name)}`;
  const og = `${path}/opengraph-image`;
  return {
    ...pageMeta({
      title: `${display} — sol.new/id`,
      description: `Resolve ${display} on Solana (.sol · .sns · .bonk · .skr). Share portfolio & send.`,
      path,
    }),
    openGraph: {
      title: `${display} — sol.new/id`,
      description: `Solana name ${display} on sol.new`,
      url: `https://sol.new${path}`,
      images: [{ url: og, width: 1200, height: 630, alt: display }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${display} — sol.new/id`,
      description: `Solana name ${display} on sol.new`,
      images: [og],
    },
  };
}

export default async function IdNamePage({ params }: Props) {
  const { name: raw } = await params;
  const name = decodeName(raw);
  return <IdNameClient name={name} />;
}
