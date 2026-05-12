"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { Clipboard, ClipboardCheck, Plus, RefreshCw, Tag, Ticket, Users } from "lucide-react";
import { Spinner } from "@/components/spinner";

type PromoCode = {
  code: string;
  uses_remaining: number;
  uses_total: number;
  description: string | null;
  created_at: string;
  expires_at: string | null;
  redemptions: number;
};

type Redemption = {
  code: string;
  wallet: string;
  kind: string;
  redeemed_at: string;
};

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authErr, setAuthErr] = useState(false);

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(false);

  const [count, setCount] = useState(5);
  const [uses, setUses] = useState(1);
  const [description, setDescription] = useState("Free NFT mint");
  const [customCode, setCustomCode] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const headers = { "Content-Type": "application/json", "x-admin-secret": secret };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/promo", { headers });
      if (res.status === 401) { setAuthed(false); setAuthErr(true); return; }
      const data = await res.json();
      setCodes(data.codes ?? []);
      setRedemptions(data.redemptions ?? []);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    setAuthErr(false);
    const res = await fetch("/api/admin/promo", { headers: { "x-admin-secret": secret } });
    if (res.status === 401) { setAuthErr(true); return; }
    setAuthed(true);
    const data = await res.json();
    setCodes(data.codes ?? []);
    setRedemptions(data.redemptions ?? []);
  };

  const generate = async () => {
    setGenerating(true);
    setNewCodes([]);
    try {
      const res = await fetch("/api/admin/promo", {
        method: "POST",
        headers,
        body: JSON.stringify({
          count: customCode ? 1 : count,
          uses,
          description: description || undefined,
          code: customCode || undefined,
        }),
      });
      const data = await res.json();
      if (data.codes) {
        setNewCodes(data.codes);
        await load();
      }
    } finally {
      setGenerating(false);
    }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(newCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4">
            <h1 className="text-xl font-bold text-center">Admin</h1>
            <input
              type="password"
              placeholder="Admin secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 outline-none focus:border-purple-400/50"
            />
            {authErr && <p className="text-sm text-red-400 text-center">Incorrect secret</p>}
            <button
              onClick={login}
              className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer"
            >
              Sign in
            </button>
          </div>
        </main>
      </div>
    );
  }

  const totalIssued = codes.reduce((s, c) => s + c.uses_total, 0);
  const totalUsed = codes.reduce((s, c) => s + (c.uses_total - c.uses_remaining), 0);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Ticket, label: "Codes", value: codes.length },
            { icon: Tag, label: "Issued uses", value: totalIssued },
            { icon: Users, label: "Redeemed", value: totalUsed },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="border border-black/10 dark:border-white/10 rounded-2xl p-4 text-center">
              <Icon className="w-5 h-5 mx-auto mb-1 text-purple-400" />
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-gray-500 dark:text-white/40">{label}</div>
            </div>
          ))}
        </div>

        {/* Generate */}
        <div className="border border-black/10 dark:border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2"><Plus className="w-4 h-4 text-purple-400" /> Generate codes</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-gray-500 dark:text-white/40">Count</span>
              <input
                type="number" min={1} max={100} value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={!!customCode}
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 outline-none focus:border-purple-400/50 disabled:opacity-40"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500 dark:text-white/40">Uses per code</span>
              <input
                type="number" min={1} max={1000} value={uses}
                onChange={(e) => setUses(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 outline-none focus:border-purple-400/50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500 dark:text-white/40">Description (shown to user)</span>
              <input
                type="text" value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Free NFT mint"
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 outline-none focus:border-purple-400/50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500 dark:text-white/40">Custom code (optional)</span>
              <input
                type="text" value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="e.g. LAUNCH2025"
                maxLength={16}
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 outline-none focus:border-purple-400/50 font-mono tracking-widest uppercase"
              />
            </label>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
          >
            {generating ? <><Spinner size={16} /> Generating…</> : <><Plus className="w-4 h-4" /> Generate {customCode ? "1 code" : `${count} code${count > 1 ? "s" : ""}`}</>}
          </button>

          {newCodes.length > 0 && (
            <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-400">✓ {newCodes.length} code{newCodes.length > 1 ? "s" : ""} created</span>
                <button onClick={copyAll} className="text-xs text-gray-400 hover:text-white transition flex items-center gap-1">
                  {copied ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copied!</> : <><Clipboard className="w-3.5 h-3.5" /> Copy all</>}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {newCodes.map((c) => (
                  <button
                    key={c}
                    onClick={() => navigator.clipboard.writeText(c)}
                    className="font-mono text-sm text-center py-2 px-3 rounded-lg bg-white dark:bg-black border border-purple-400/30 hover:border-purple-400 text-purple-400 transition tracking-widest"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Code list */}
        <div className="border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
            <h2 className="font-semibold">All codes</h2>
            <button onClick={load} disabled={loading} className="text-gray-400 hover:text-white transition">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-xs text-gray-500 dark:text-white/40">
                  <th className="text-left px-6 py-3">Code</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-center px-4 py-3">Uses left</th>
                  <th className="text-center px-4 py-3">Redeemed</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.code} className="border-b border-black/5 dark:border-white/5 hover:bg-black/2 dark:hover:bg-white/2">
                    <td className="px-6 py-3 font-mono text-purple-400 tracking-widest">
                      <button onClick={() => navigator.clipboard.writeText(c.code)} title="Copy">
                        {c.code}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-white/50">{c.description ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={c.uses_remaining === 0 ? "text-gray-400 line-through" : "text-green-400"}>
                        {c.uses_remaining}/{c.uses_total}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 dark:text-white/50">{c.redemptions}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {codes.length === 0 && !loading && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No codes yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Redemptions */}
        {redemptions.length > 0 && (
          <div className="border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-black/10 dark:border-white/10">
              <h2 className="font-semibold">Recent redemptions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-xs text-gray-500 dark:text-white/40">
                    <th className="text-left px-6 py-3">Code</th>
                    <th className="text-left px-4 py-3">Wallet</th>
                    <th className="text-left px-4 py-3">Kind</th>
                    <th className="text-left px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r, i) => (
                    <tr key={i} className="border-b border-black/5 dark:border-white/5">
                      <td className="px-6 py-3 font-mono text-purple-400 tracking-widest text-xs">{r.code}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-white/50">{short(r.wallet)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/50">{r.kind}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(r.redeemed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
