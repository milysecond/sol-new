import type { Metadata } from "next";
import { OrbitGallery } from "./orbit-gallery";

export const metadata: Metadata = {
  title: "Gallery — sol.new",
  description: "A spherical gallery of tokens launched on sol.new. Drag to orbit, click a token to open it.",
};

export default function GalleryPage() {
  return <OrbitGallery />;
}
