import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Gallery — sol.new",
  description:
    "A spherical gallery of tokens launched on sol.new. Drag to orbit, click a token to open it.",
};

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

export default function GalleryPage() {
  return <OrbitGallery />;
}
