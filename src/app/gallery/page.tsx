import type { Metadata } from "next";
import { GalleryClient } from "./gallery-client";

export const metadata: Metadata = {
  title: "Gallery — sol.new",
  description:
    "A spherical gallery of tokens launched on sol.new. Drag to orbit, click a token to open it.",
};

export default function GalleryPage() {
  return <GalleryClient />;
}
