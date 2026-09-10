import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { ZkClient } from "./zk-client";

export const metadata: Metadata = pageMeta({
  title: "ZK - sol.new",
  description: "zk.sol.new API. Shield, prove, and send with the live docs.",
  path: "/zk",
});

export default function Page() {
  return <ZkClient />;
}
