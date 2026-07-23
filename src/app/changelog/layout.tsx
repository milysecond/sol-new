import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Changelog — sol.new",
  description: "Public product changelog for sol.new: new features, fixes, and improvements.",
  path: "/changelog",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
