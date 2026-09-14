import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { WrapClient } from "./wrap-client";

export const metadata: Metadata = pageMeta({
  title: "Wrap SOL - sol.new",
  description: "Wrap SOL to wSOL and unwrap back. Passkey signs. No protocol fee.",
  path: "/wrap",
});

export default function Page() {
  return <WrapClient />;
}
