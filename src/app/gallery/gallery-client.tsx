"use client";

import dynamic from "next/dynamic";

const OrbitGallery = dynamic(
  () => import("./orbit-gallery").then((m) => m.OrbitGallery),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-dvh flex items-center justify-center text-sm text-gray-500">
        Loading gallery…
      </div>
    ),
  },
);

export function GalleryClient() {
  return <OrbitGallery />;
}
