import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import LockPage from "./lock-client";

export const metadata: Metadata = pageMeta({
  title: "Lock tokens - sol.new",
  description:
    "Lock SPL tokens with a cliff unlock on Jupiter Lock. Passkey signs. No protocol fee.",
  path: "/lock",
});

export default function Page() {
  return <LockPage />;
}
