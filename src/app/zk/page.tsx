import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { ZkClient } from "./zk-client";

export const metadata: Metadata = pageMeta({
  title: "ZK - sol.new",
  description: "Shield SOL via zk.sol.new. Passkey signs. Proofs stay in the browser.",
  path: "/zk",
});

export default function Page() {
  return <ZkClient />;
}
