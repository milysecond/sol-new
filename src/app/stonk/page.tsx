import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import StonkForm from "@/app/token/stonk-form";

export const metadata: Metadata = pageMeta({
  title: "StonkFun - sol.new",
  description: "Launch a StonkFun token paired with stocks, SOL, or another mint. Passkey signs.",
  path: "/stonk",
});

export default function Page() {
  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <ConnectGate action="launch on StonkFun">
          <StonkForm />
        </ConnectGate>
      </main>
    </div>
  );
}
