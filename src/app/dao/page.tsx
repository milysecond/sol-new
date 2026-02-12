"use client";

import { useState } from "react";
import Link from "next/link";

export default function DaoPage() {
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [members, setMembers] = useState(["", ""]);
  const [created, setCreated] = useState(false);

  const addMember = () => setMembers([...members, ""]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/" className="text-xl font-bold tracking-tight">
          sol<span className="text-purple-400">.new</span>
        </Link>
        <span className="text-sm text-white/40">DAO</span>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center space-y-3">
            <div className="text-4xl">🏛️</div>
            <h1 className="text-3xl font-bold tracking-tight">Spin up a DAO</h1>
            <p className="text-white/50">Create a multisig wallet for your team.</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="DAO name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition"
            />

            <div className="space-y-2">
              <label className="text-sm text-white/40">Members</label>
              {members.map((m, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Wallet address ${i + 1}`}
                  value={m}
                  onChange={(e) => {
                    const next = [...members];
                    next[i] = e.target.value;
                    setMembers(next);
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono text-sm"
                />
              ))}
              <button
                onClick={addMember}
                className="text-sm text-purple-400 hover:text-purple-300 transition cursor-pointer"
              >
                + Add member
              </button>
            </div>

            <div>
              <label className="text-sm text-white/40">
                Approval threshold: {threshold} of {members.length}
              </label>
              <input
                type="range"
                min="1"
                max={members.length}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full mt-2 accent-purple-500"
              />
            </div>

            <button
              onClick={() => {
                if (!name) return;
                setCreated(true);
                setTimeout(() => setCreated(false), 3000);
              }}
              disabled={!name}
              className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {created ? "Coming soon ✨" : "Create DAO →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
