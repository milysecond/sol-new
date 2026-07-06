import type { Metadata } from "next";

const BASE = "https://sol.new";

export function pageMeta(opts: { title: string; description: string; path: string; image?: string }): Metadata {
  const url = `${BASE}${opts.path}`;
  const image = opts.image ?? `${BASE}/og.png`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: "sol.new",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: opts.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      creator: "@soldotnew",
      images: [image],
    },
  };
}
