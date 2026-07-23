import type { Metadata } from "next";

const BASE = "https://sol.new";

export function pageMeta(opts: { title: string; description: string; path: string; image?: string }): Metadata {
  const url = `${BASE}${opts.path}`;
  // Prefer colocated opengraph-image.tsx (dynamic). Explicit image only when provided.
  const images = opts.image
    ? [{ url: opts.image, width: 1200, height: 630, alt: opts.title }]
    : undefined;
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
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      creator: "@soldotnew",
      ...(opts.image ? { images: [opts.image] } : {}),
    },
  };
}
