import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Create a Token — sol.new",
  description:
    "Launch your own token on Solana in seconds. Passkey-secured, low fees. Upload an image, pick a name, and go live instantly.",
  path: "/token",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
