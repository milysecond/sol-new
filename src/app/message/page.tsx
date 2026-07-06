"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { PenLine, Check, Copy, ShieldCheck, ShieldX, Link2, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { friendlyError } from "@/lib/friendly-errors";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const inputClass =
  "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-400/25 transition text-sm";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-400 dark:text-white/30">{label}</p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-xs text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer flex items-center gap-1"
        >
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <p className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-xs text-gray-700 dark:text-white/70 break-all">
        {value}
      </p>
    </div>
  );
}

function SignSection({ onSigned }: { onSigned: (r: { message: string; signature: string; address: string }) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; signature: string; address: string; webauthn?: boolean } | null>(null);
  const [onchain, setOnchain] = useState<{ status: "idle" | "sending" | "done"; signature?: string }>({ status: "idle" });
  const { publicKey, signer } = useWallet();
  const { network } = useNetwork();

  const handleSign = async () => {
    if (!message) return;
    setError(null);
    setOnchain({ status: "idle" });
    setBusy(true);
    try {
      const s = await signer();
      const signed = await s.signMessage(message);
      // The checker below verifies ed25519 signatures; webauthn (smart wallet)
      // signatures verify server-side instead (M5) — still shown and copyable.
      const r = {
        message,
        signature: signed.signature,
        address: signed.signer,
        webauthn: signed.type === "webauthn",
      };
      setResult(r);
      if (!r.webauthn) onSigned(r);
    } catch (e) {
      setError(friendlyError(e, "We couldn't sign that. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleOnchain = async () => {
    if (!result || !publicKey) return;
    setError(null);
    setOnchain({ status: "sending" });
    try {
      const s = await signer();
      const sig = await s.signAndSend([
        new TransactionInstruction({
          keys: [{ pubkey: new PublicKey(publicKey), isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(result.message, "utf8"),
        }),
      ]);
      setOnchain({ status: "done", signature: sig });
    } catch (e) {
      setOnchain({ status: "idle" });
      setError(friendlyError(e, "We couldn't write that on-chain. Check you have a little SOL for the network fee."));
    }
  };

  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold">Sign a message</h2>
      <p className="text-sm text-gray-500 dark:text-white/40">
        Signing proves a message came from your wallet — without spending anything.
      </p>
      <label htmlFor="sign-message" className="sr-only">Message to sign</label>
      <textarea
        id="sign-message"
        placeholder="Type anything — e.g. I own this wallet"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        className={`${inputClass} resize-none`}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">{error}</div>
      )}
      <button
        onClick={handleSign}
        disabled={!message || busy}
        className="w-full bg-teal-500 hover:bg-teal-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {busy ? <><Spinner size={16} /> Signing…</> : "Sign with Face ID"}
      </button>
      {result && (
        <div className="space-y-3 pt-1">
          <CopyField label={result.webauthn ? "Signature (passkey)" : "Signature (base58)"} value={result.signature} />
          <CopyField label="Signed by" value={result.address} />
          <p className="text-xs text-gray-400 dark:text-white/30 text-center">
            {result.webauthn
              ? "Passkey signatures are verified by sol.new when you post — the checker below is for classic wallet signatures."
              : "Filled into the checker below — hit Verify to test the round trip."}
          </p>

          <div className="border-t border-black/10 dark:border-white/10 pt-3 space-y-2">
            <p className="text-xs text-gray-400 dark:text-white/30 text-center">
              That signature was <b>off-chain</b> — free, instant, nothing recorded. Want public proof anyone can look up?
            </p>
            {onchain.status === "done" && onchain.signature ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-xl px-4 py-3 text-teal-600 dark:text-teal-400 text-sm">
                  <Check size={16} /> Your message is on the blockchain — forever.
                </div>
                <a
                  href={`https://explorer.solana.com/tx/${onchain.signature}${network === "devnet" ? "?cluster=devnet" : ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition"
                >
                  See it on the explorer <ExternalLink size={13} />
                </a>
              </div>
            ) : (
              <>
                <button
                  onClick={handleOnchain}
                  disabled={onchain.status === "sending"}
                  className="w-full bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 disabled:opacity-50 text-gray-900 dark:text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {onchain.status === "sending"
                    ? <><Spinner size={16} /> Writing on-chain…</>
                    : <><Link2 size={16} /> Write it on-chain</>}
                </button>
                <p className="text-center text-xs text-gray-400 dark:text-white/30">
                  ~0.000005 SOL network fee{network === "devnet" && " (devnet — free practice SOL)"}
                </p>
              </>
            )}
          </div>
        </div>
      )}
      {publicKey && !result && (
        <p className="text-center text-xs text-gray-400 dark:text-white/30">
          Signing as {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
        </p>
      )}
    </div>
  );
}

function VerifySection({
  prefill,
}: {
  prefill: { message: string; signature: string; address: string } | null;
}) {
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [address, setAddress] = useState("");
  const [verdict, setVerdict] = useState<"valid" | "invalid" | "error" | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastPrefill, setLastPrefill] = useState<typeof prefill>(null);

  // Adopt new signatures from the sign section as they arrive
  if (prefill && prefill !== lastPrefill) {
    setLastPrefill(prefill);
    setMessage(prefill.message);
    setSignature(prefill.signature);
    setAddress(prefill.address);
    setVerdict(null);
  }

  const handleVerify = () => {
    setErrorText(null);
    try {
      const pk = new PublicKey(address.trim());
      const sig = bs58.decode(signature.trim());
      if (sig.length !== 64) throw new Error("A signature is 64 bytes — this one isn't. Check you copied all of it.");
      const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pk.toBytes());
      setVerdict(ok ? "valid" : "invalid");
    } catch (e) {
      setVerdict("error");
      setErrorText(friendlyError(e, "That doesn't look like a valid address or signature."));
    }
  };

  const canVerify = message && signature && address;

  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold">Check a signature</h2>
      <p className="text-sm text-gray-500 dark:text-white/40">
        Paste any message, signature, and address to test whether they match. Works with signatures from any Solana wallet.
      </p>
      <label htmlFor="verify-message" className="sr-only">Message</label>
      <textarea
        id="verify-message"
        placeholder="The exact message that was signed"
        value={message}
        onChange={(e) => { setMessage(e.target.value); setVerdict(null); }}
        rows={3}
        className={`${inputClass} resize-none`}
      />
      <label htmlFor="verify-signature" className="sr-only">Signature</label>
      <input
        id="verify-signature"
        type="text"
        placeholder="Signature (base58)"
        value={signature}
        onChange={(e) => { setSignature(e.target.value); setVerdict(null); }}
        className={`${inputClass} font-mono`}
      />
      <label htmlFor="verify-address" className="sr-only">Wallet address</label>
      <input
        id="verify-address"
        type="text"
        placeholder="Wallet address"
        value={address}
        onChange={(e) => { setAddress(e.target.value); setVerdict(null); }}
        className={`${inputClass} font-mono`}
      />
      <button
        onClick={handleVerify}
        disabled={!canVerify}
        className="w-full bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 disabled:opacity-50 text-gray-900 dark:text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
      >
        Verify
      </button>
      {verdict === "valid" && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-600 dark:text-green-400 text-sm">
          <ShieldCheck size={16} /> Real — this wallet signed this exact message.
        </div>
      )}
      {verdict === "invalid" && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">
          <ShieldX size={16} /> No match — the message, signature, and address don&apos;t line up.
        </div>
      )}
      {verdict === "error" && errorText && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">{errorText}</div>
      )}
    </div>
  );
}

export default function MessagePage() {
  const [signed, setSigned] = useState<{ message: string; signature: string; address: string } | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <div className="w-full sm:max-w-lg space-y-4">
          <div className="text-center space-y-1">
            <AnimatedIcon icon={PenLine} size={32} className="text-teal-400" />
            <h1 className="text-2xl font-bold tracking-tight">Sign a message</h1>
            <p className="text-gray-500 dark:text-white/50 text-sm">
              Prove you own your wallet — and test any signature.
            </p>
          </div>

          <ConnectGate action="sign a message">
            <PageTransition>
              <SignSection onSigned={setSigned} />
            </PageTransition>
          </ConnectGate>

          <VerifySection prefill={signed} />
        </div>
      </main>
    </div>
  );
}
