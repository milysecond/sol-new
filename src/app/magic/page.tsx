"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fingerprint, ShieldCheck, AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { recoverPasskeyWallet } from "@/lib/passkey-wallet";

type Claims = {
  email: string;
  wallet: string;
  credentialId: string | null;
  purpose: "link" | "open";
};

type Status =
  | { kind: "loading" }
  | { kind: "ready"; claims: Claims }
  | { kind: "ok"; wallet: string }
  | { kind: "err"; text: string };

function short(pk: string) {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

function MagicInner() {
  const params = useSearchParams();
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const token = params.get("t") || params.get("token") || "";

  useEffect(() => {
    if (!token) {
      setStatus({ kind: "err", text: "Missing magic link token." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/magic-link?t=${encodeURIComponent(token)}`
        );
        const data = (await res.json()) as Claims & { error?: string };
        if (!res.ok || data.error) {
          throw new Error(data.error || "Invalid or expired link");
        }
        if (cancelled) return;
        setStatus({
          kind: "ready",
          claims: {
            email: data.email,
            wallet: data.wallet,
            credentialId: data.credentialId,
            purpose: data.purpose,
          },
        });
      } catch (e) {
        if (!cancelled) {
          setStatus({
            kind: "err",
            text: e instanceof Error ? e.message : "Invalid link",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const activate = useCallback(async () => {
    if (status.kind !== "ready") return;
    const { claims } = status;
    setBusy(true);
    try {
      // Pin allowCredentials so the browser offers the right passkey when known
      if (claims.credentialId) {
        localStorage.setItem("sol.new.credentialId", claims.credentialId);
      }
      localStorage.setItem("sol.new.wallet", claims.wallet);

      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys require HTTPS and a supported browser.");
      }

      const result = await recoverPasskeyWallet();
      if (result.publicKey !== claims.wallet) {
        throw new Error(
          `This passkey opens ${short(result.publicKey)}, not ${short(claims.wallet)}. Use the device that created this wallet.`
        );
      }

      const label = `Wallet ${short(result.publicKey)}`;
      const entry = {
        pubkey: result.publicKey,
        credentialId: result.credentialId,
        label,
      };
      try {
        const wallets = JSON.parse(
          localStorage.getItem("sol.new.wallets") || "[]"
        ) as Array<{ pubkey: string; credentialId: string; label: string }>;
        const idx = wallets.findIndex((w) => w.pubkey === entry.pubkey);
        if (idx >= 0) wallets[idx] = entry;
        else wallets.push(entry);
        localStorage.setItem("sol.new.wallets", JSON.stringify(wallets));
      } catch {
        /* ignore */
      }
      localStorage.setItem("sol.new.wallet", result.publicKey);
      localStorage.setItem("sol.new.credentialId", result.credentialId);
      localStorage.setItem("sol.new.walletLabel", label);
      localStorage.setItem("sol.new.magicEmail", claims.email);

      await fetch("/api/magic-link/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          wallet: result.publicKey,
          credentialId: result.credentialId,
        }),
      });

      setStatus({ kind: "ok", wallet: result.publicKey });
      // Hard reload so WalletProvider picks up localStorage
      setTimeout(() => {
        window.location.href = "/wallet";
      }, 900);
    } catch (e) {
      setStatus({
        kind: "err",
        text:
          e instanceof Error
            ? e.message
            : "Passkey check failed. Try again on the device that owns this wallet.",
      });
    } finally {
      setBusy(false);
    }
  }, [status, token]);

  return (
    <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-black/90 shadow-2xl shadow-purple-500/10 px-6 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-3 mb-6">
        <Image
          src="/icon-192.png"
          alt="sol.new"
          width={56}
          height={56}
          className="rounded-2xl"
          priority
        />
        <div className="text-lg font-bold tracking-tight text-white">
          sol<span className="text-purple-400">.new</span>
        </div>
      </div>

      {status.kind === "loading" ? (
        <div className="flex flex-col items-center gap-3 py-10 text-zinc-400 text-sm">
          <Spinner size={24} className="w-6 h-6 text-purple-400" />
          Checking magic link…
        </div>
      ) : null}

      {status.kind === "err" ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Link issue</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">{status.text}</p>
          <Link
            href="/"
            className="inline-block text-sm text-purple-400 hover:underline"
          >
            Back to sol.new
          </Link>
        </div>
      ) : null}

      {status.kind === "ok" ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-purple-500/15 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-purple-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Wallet ready</h1>
          <p className="text-sm text-zinc-400 font-mono">{short(status.wallet)}</p>
          <p className="text-xs text-zinc-500">Opening wallet…</p>
        </div>
      ) : null}

      {status.kind === "ready" ? (
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">
              {status.claims.purpose === "open"
                ? "Open your wallet"
                : "Confirm wallet link"}
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Email{" "}
              <span className="text-zinc-200">{status.claims.email}</span> is
              tied to passkey wallet
            </p>
            <p className="font-mono text-sm text-purple-300 break-all">
              {status.claims.wallet}
            </p>
          </div>

          {publicKey && publicKey !== status.claims.wallet ? (
            <p className="text-xs text-amber-300/90 text-center rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              You currently have a different wallet connected. Continuing will
              switch to the linked wallet after passkey confirmation.
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={activate}
            className="w-full rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-semibold py-3 disabled:opacity-50 hover:brightness-110 transition flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Spinner size={16} className="w-4 h-4" />
                Checking passkey…
              </>
            ) : (
              <>
                <Fingerprint className="w-4 h-4" />
                Unlock with passkey
              </>
            )}
          </button>

          <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
            Your private key never leaves this device. The email only names which
            wallet to open — Face ID / fingerprint proves you own it.
          </p>

          <p className="text-center text-xs text-zinc-500">
            <Link href="/" className="text-purple-400 hover:underline">
              Cancel
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function MagicPage() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4 py-12 bg-white dark:bg-black">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.12),_transparent_55%)]" />
      <div className="relative z-10 w-full flex justify-center">
        <Suspense
          fallback={
            <div className="text-sm text-zinc-500 py-20">Loading…</div>
          }
        >
          <MagicInner />
        </Suspense>
      </div>
    </main>
  );
}
