"use client";

import { useEffect, useState } from "react";
import { useWallet, type WalletEntry } from "@/lib/wallet-context";
import {
  cancelConditionalPasskey,
  isConditionalPasskeyAvailable,
  passkeyAccountName,
} from "@/lib/passkey-wallet";

/** "Sign in as sol.new · AbCd…wXyZ" when this device knows exactly one wallet. */
export function signInLabel(wallets: WalletEntry[]): string {
  if (wallets.length === 1 && wallets[0]?.pubkey) {
    return `Sign in as ${passkeyAccountName(wallets[0].pubkey, wallets[0].email)}`;
  }
  return "Sign in with passkey";
}

/**
 * Passkey autofill (WebAuthn conditional mediation). Renders an input the
 * browser can attach its passkey suggestions to, and signs in when one is
 * picked. Renders nothing where conditional UI isn't supported; the visible
 * "Sign in" button is the click fallback. Never creates a passkey.
 */
export function PasskeyAutofill({
  onSignedIn,
  className = "",
}: {
  onSignedIn?: (pubkey: string) => void;
  className?: string;
}) {
  const { publicKey, autofillUnlock } = useWallet();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let alive = true;
    void isConditionalPasskeyAvailable().then((ok) => {
      if (alive) setSupported(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!supported || publicKey) return;
    let alive = true;
    void autofillUnlock().then((pk) => {
      if (alive && pk) onSignedIn?.(pk);
    });
    return () => {
      alive = false;
      cancelConditionalPasskey();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, publicKey]);

  if (!supported || publicKey) return null;

  return (
    <label className={`block text-left ${className}`}>
      <span className="block text-[11px] text-gray-500 dark:text-white/40 mb-1">
        Have a sol.new passkey? Pick it here
      </span>
      <input
        type="text"
        name="username"
        autoComplete="username webauthn"
        placeholder="Your sol.new passkey"
        className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-violet-400/50"
      />
    </label>
  );
}
