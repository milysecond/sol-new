import type { Metadata } from "next";

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
  const { mint } = await params;

  try {
    const res = await fetch(`${API_BASE}/api/token/${mint}`, { next: { revalidate: 60 } });
    if (res.ok) {
      const token = (await res.json()) as { name: string; symbol: string; description?: string | null };
      // Title: target 50–60 chars
      const title = `${token.name} ($${token.symbol}) just launched on sol.new — Solana memecoin`;
      // Description: target 110–160 chars
      const baseDesc = token.description ? `${token.description.slice(0, 80)} — ` : "";
      const description = `${baseDesc}${token.name} ($${token.symbol}) launched instantly on sol.new, the passkey-secured Solana token launchpad with 1% fees.`.slice(0, 160);

      // OG image is auto-discovered from the colocated opengraph-image.tsx (1200×630).

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `https://sol.new/token/${mint}`,
          siteName: "sol.new",
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
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

export default async function TokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  let jsonLd: object | null = null;
  try {
    const res = await fetch(`${API_BASE}/api/token/${mint}`, { next: { revalidate: 60 } });
    if (res.ok) {
      const token = (await res.json()) as { name: string; symbol: string; description?: string | null; image_url?: string | null };
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: token.name,
        description: token.description ?? `${token.name} ($${token.symbol}) — Solana token launched on sol.new`,
        url: `https://sol.new/token/${mint}`,
        image: token.image_url ?? undefined,
        identifier: mint,
        brand: { "@type": "Brand", name: "sol.new" },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      };
    }
  } catch {}

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
