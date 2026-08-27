import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Traction — daily activity (UTC) — sol.new",
  description:
    "Daily signups and product activity on sol.new. All timestamps in UTC.",
  path: "/traction",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
