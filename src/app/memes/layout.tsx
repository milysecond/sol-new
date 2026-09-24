import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Memes — sol.new",
  description:
    "Caption classic meme blanks on sol.new. Drag text, download PNG. Free with a watermark, or pay 0.01 SOL for a clean export.",
  path: "/memes",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
