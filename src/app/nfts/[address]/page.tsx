"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Deep link: /nfts/<address> → main browse with that owner. */
export default function NftsAddressPage() {
  const params = useParams();
  const router = useRouter();
  const address = typeof params.address === "string" ? params.address : "";

  useEffect(() => {
    if (address) {
      // Client page shares logic via query-less replace into /nfts — store in session for handoff
      try {
        sessionStorage.setItem("sol.new.nfts.owner", address);
      } catch {
        /* ignore */
      }
      router.replace(`/nfts?owner=${encodeURIComponent(address)}`);
    } else {
      router.replace("/nfts");
    }
  }, [address, router]);

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center text-gray-400 text-sm">
      Loading…
    </div>
  );
}
