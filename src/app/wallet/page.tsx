"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";

export default function WalletRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/wallet/get"); }, [router]);
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
    </div>
  );
}
