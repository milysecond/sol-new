import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Lab — component playground — sol.new",
  description:
    "Interactive sol.new component playground: action button, TX confirm, wallet modal, CMD+K, passkey create motion.",
  path: "/lab",
});

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
