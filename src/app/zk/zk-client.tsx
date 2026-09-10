"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";

const DOCS = "https://zk.sol.new/docs";

type PathOps = { path: string; methods: string[]; summary?: string };

function parseSpec(spec: Record<string, unknown>): PathOps[] {
  const paths = spec.paths as Record<string, Record<string, { summary?: string }>> | undefined;
  if (!paths) return [];
  return Object.entries(paths).map(([path, ops]) => {
    const methods = Object.keys(ops).filter((k) => !k.startsWith("x-")).map((m) => m.toUpperCase());
    const first = Object.values(ops).find((o) => o && typeof o === "object");
    return { path, methods, summary: first?.summary };
  });
}

export function ZkClient() {
  const [ops, setOps] = useState<PathOps[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/zk/openapi");
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          spec?: Record<string, unknown>;
          source?: string;
        };
        if (cancelled) return;
        if (!json.ok || !json.spec) {
          setError(json.error || "OpenAPI unavailable");
          return;
        }
        setSource(json.source || DOCS);
        setOps(parseSpec(json.spec));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <PageTransition>
          <div className="app-shell py-6 sm:py-10 space-y-6">
            <div className="text-center lg:text-left space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-500/15 text-violet-500">
                <Shield className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ZK</h1>
              <p className="text-sm text-gray-500 dark:text-white/50 max-w-xl">
                Live API from zk.sol.new. Full Swagger at the docs link.
              </p>
              <a
                href={DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-semibold px-3.5 py-2"
              >
                zk.sol.new/docs
              </a>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}. Open the docs link above.</p>
            )}
            {source && (
              <p className="text-xs text-gray-400">Spec {source}</p>
            )}
            {ops.length > 0 && (
              <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-gray-400">
                    <tr>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2">Path</th>
                      <th className="px-4 py-2">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((o) => (
                      <tr key={o.path} className="border-t border-black/5 dark:border-white/5">
                        <td className="px-4 py-2 font-mono text-violet-500">{o.methods.join(" ")}</td>
                        <td className="px-4 py-2 font-mono break-all">{o.path}</td>
                        <td className="px-4 py-2 text-gray-500">{o.summary || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <iframe
              title="zk.sol.new docs"
              src={DOCS}
              className="w-full min-h-[70vh] rounded-2xl border border-black/10 dark:border-white/10 bg-black"
            />
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
