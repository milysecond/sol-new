"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldHalf } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { RING_FIELD, RING_PRIMARY } from "@/components/ring-ui";
import { parsePastedRingLink } from "@/lib/ring/link";

/** Fallback for apps that drop the `#secret` when opening a link: paste it here. */
export default function RingPasteLinkPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="mx-auto w-full max-w-lg px-4 sm:px-6 py-8 space-y-4">
        <div className="text-center space-y-1">
          <ShieldHalf className="w-8 h-8 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight">Open a private pay link</h1>
          <p className="text-sm text-gray-500 dark:text-white/50">Paste the whole link, including the part after #.</p>
        </div>
        <input
          className={`${RING_FIELD} font-mono text-sm`}
          placeholder="https://sol.new/ring/c/…#…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="button"
          className={RING_PRIMARY}
          onClick={() => {
            const parsed = parsePastedRingLink(text);
            if (!parsed.ok) {
              setError(parsed.reason === "no-secret" ? "That link is missing its secret (the part after #)." : "That isn't a sol.new pay link.");
              return;
            }
            const hash = new URL(text.trim()).hash;
            router.push(`/ring/c/${parsed.address}${hash}`);
          }}
        >
          Open link
        </button>
      </main>
    </div>
  );
}
