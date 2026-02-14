import type { Metadata } from "next";

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
  const { mint } = await params;

  try {
    const res = await fetch(`${API_BASE}/api/token/${mint}`, { next: { revalidate: 60 } });
    if (res.ok) {
      const token = await res.json();
      const title = `${token.name} ($${token.symbol}) — launched on sol.new`;
      const description = token.description
        ? `${token.description.slice(0, 140)} — Created on sol.new, the fastest way to launch tokens on Solana.`
        : `${token.name} ($${token.symbol}) token launched on sol.new. Create your own token on Solana in seconds.`;
      const image = token.image_url?.startsWith("ipfs://")
        ? token.image_url.replace("ipfs://", "https://nftstorage.link/ipfs/")
        : token.image_url;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `https://sol.new/launch/${mint}`,
          siteName: "sol.new",
          ...(image ? { images: [{ url: image, width: 512, height: 512, alt: token.name }] } : {}),
        },
        twitter: {
          card: "summary",
          title,
          description,
          ...(image ? { images: [image] } : {}),
          creator: "@soldotnew",
        },
      };
    }
  } catch {}

  return {
    title: `Token ${mint.slice(0, 8)}... — sol.new`,
    description: "View this token launched on sol.new. Create your own tokens, NFTs, and wallets on Solana instantly.",
  };
}

export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
