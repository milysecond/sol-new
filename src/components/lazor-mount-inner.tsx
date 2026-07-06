"use client";

import { useEffect } from "react";
import { LazorkitProvider, useWallet as useLazorWallet } from "@lazorkit/wallet";
import { RPC, type Network } from "@/lib/network";
import type { LazorHandle } from "@/lib/wallet-signer";

const PORTAL_URL = "https://portal.lazor.sh";

function Binder({ onHandle }: { onHandle: (h: LazorHandle | null) => void }) {
  const lazor = useLazorWallet();
  useEffect(() => {
    onHandle(lazor as unknown as LazorHandle);
  }, [lazor, onHandle]);
  return null;
}

export default function LazorMountInner({
  network,
  onHandle,
}: {
  network: Network;
  onHandle: (h: LazorHandle | null) => void;
}) {
  return (
    <LazorkitProvider
      rpcUrl={RPC[network]}
      portalUrl={PORTAL_URL}
      paymasterConfig={{ paymasterUrl: `/api/paymaster?cluster=${network}` }}
    >
      <Binder onHandle={onHandle} />
    </LazorkitProvider>
  );
}
