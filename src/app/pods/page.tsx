"use client";

import { Navbar } from "@/components/navbar";
import { Headphones, Play, Pause, ChevronDown } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useState } from "react";
import { usePodPlayer } from "@/lib/pod-player";

type Pod = {
  title: string;
  host: string;
  desc: string;
  tag: string;
  accent: string; // tailwind text + bg classes for the avatar
  spotifyUrl?: string; // exact show link; falls back to a title search
};

type Episode = {
  title: string;
  audioUrl: string;
  pubDate: string;
  duration: string;
  image: string | null;
};

type ShowState = {
  loading: boolean;
  error: boolean;
  episodes: Episode[];
  art: string | null;
};

const PODS: Pod[] = [
  {
    title: "The Solana Podcast",
    host: "Austin Federa",
    desc: "Long-form conversations with the founders and builders shaping the Solana ecosystem.",
    tag: "Solana",
    accent: "text-purple-500 bg-purple-500/10",
  },
  {
    title: "Lightspeed",
    host: "Blockworks",
    desc: "A Solana-first show on the apps, tokens, and people moving the ecosystem each week.",
    tag: "Solana",
    accent: "text-fuchsia-500 bg-fuchsia-500/10",
  },
  {
    title: "Validated",
    host: "Solana Foundation",
    desc: "Technical deep dives with the core contributors building the Solana network.",
    tag: "Solana",
    accent: "text-green-500 bg-green-500/10",
  },
  {
    title: "Empire",
    host: "Jason Yanowitz & Santiago Santos",
    desc: "The business, macro, and money behind crypto markets and the teams building them.",
    tag: "Markets",
    accent: "text-amber-500 bg-amber-500/10",
  },
  {
    title: "Bankless",
    host: "Ryan Sean Adams & David Hoffman",
    desc: "Your guide to crypto finance, frontier tech, and the emerging open economy.",
    tag: "DeFi",
    accent: "text-orange-500 bg-orange-500/10",
  },
  {
    title: "Unchained",
    host: "Laura Shin",
    desc: "Sharp, journalist-led interviews on the biggest stories and people in crypto.",
    tag: "News",
    accent: "text-sky-500 bg-sky-500/10",
  },
  {
    title: "The Delphi Podcast",
    host: "Delphi Digital",
    desc: "Deep research-driven conversations on crypto markets, protocols, and emerging theses.",
    tag: "Markets",
    accent: "text-rose-500 bg-rose-500/10",
  },
  {
    title: "Zero Knowledge",
    host: "Anna Rose",
    desc: "The deep tech of zero-knowledge proofs, cryptography, and the people behind it.",
    tag: "Tech",
    accent: "text-indigo-500 bg-indigo-500/10",
  },
  {
    title: "Web3 with a16z",
    host: "a16z crypto",
    desc: "How web3 is actually built — from frontier research to real-world products.",
    tag: "Tech",
    accent: "text-teal-500 bg-teal-500/10",
  },
  {
    title: "Solana Downunder",
    host: "Sal Samani",
    desc: "Weekly roundup of everything relevant to Solana enjoyers Downunder.",
    tag: "Solana",
    accent: "text-cyan-500 bg-cyan-500/10",
    spotifyUrl: "https://open.spotify.com/show/6r9zUgG0RdolFuqbtXahGu",
  },
  {
    title: "The Metasal Pod",
    host: "Metasal",
    desc: "Conversations on tech, blockchain, crypto, and Solana.",
    tag: "Tech",
    accent: "text-lime-500 bg-lime-500/10",
    spotifyUrl: "https://open.spotify.com/show/2xce1PJ1KKDZJU10a76Uuu",
  },
  {
    title: "Quickbytes",
    host: "Sal Samani",
    desc: "Bite-sized insights on Solana, web3, and stablecoins from Australia. New episodes weekly.",
    tag: "Solana",
    accent: "text-pink-500 bg-pink-500/10",
  },
  {
    title: "DevRels Podcast",
    host: "DevRels",
    desc: "Developer relations in practice — community, advocacy, and the people behind dev ecosystems.",
    tag: "Tech",
    accent: "text-blue-500 bg-blue-500/10",
    spotifyUrl: "https://open.spotify.com/show/033MSY7a0tSzFTH75TBYG1",
  },
];

const TAG_COLOR: Record<string, string> = {
  Solana: "text-purple-500 bg-purple-500/10",
  Markets: "text-amber-500 bg-amber-500/10",
  DeFi: "text-orange-500 bg-orange-500/10",
  News: "text-sky-500 bg-sky-500/10",
  Tech: "text-indigo-500 bg-indigo-500/10",
};

const initials = (s: string) =>
  s
    .replace(/^The\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const spotify = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}/podcasts`;
const apple = (q: string) => `https://podcasts.apple.com/us/search?term=${encodeURIComponent(q)}`;
const youtube = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q + " podcast")}`;

const fmtDate = (raw: string) => {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function PlatformLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open on ${label}`}
      aria-label={`Open on ${label}`}
      className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/10 text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20 flex items-center justify-center transition"
    >
      {children}
    </a>
  );
}

export default function PodsPage() {
  const { now, playing, play, toggle, isCurrent } = usePodPlayer();
  const [shows, setShows] = useState<Record<string, ShowState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadShow = async (title: string): Promise<ShowState | undefined> => {
    if (shows[title]?.episodes.length || shows[title]?.loading) return shows[title];
    setShows((s) => ({ ...s, [title]: { loading: true, error: false, episodes: [], art: null } }));
    try {
      const res = await fetch(`/api/pods?show=${encodeURIComponent(title)}&limit=6`);
      const data = (await res.json()) as { episodes?: Episode[]; showArt?: string | null };
      const next: ShowState = {
        loading: false,
        error: !data.episodes,
        episodes: data.episodes ?? [],
        art: data.showArt ?? null,
      };
      setShows((s) => ({ ...s, [title]: next }));
      return next;
    } catch {
      const next: ShowState = { loading: false, error: true, episodes: [], art: null };
      setShows((s) => ({ ...s, [title]: next }));
      return next;
    }
  };

  const onListen = async (pod: Pod) => {
    const wasExpanded = expanded.has(pod.title);
    setExpanded((e) => {
      const n = new Set(e);
      if (wasExpanded) n.delete(pod.title);
      else n.add(pod.title);
      return n;
    });
    if (wasExpanded) return;
    const state = await loadShow(pod.title);
    // Auto-play the latest episode on first open (this is a user gesture).
    if (state && state.episodes.length && !now) {
      playEpisode(state.episodes[0], pod.title, state.art);
    }
  };

  const playEpisode = (ep: Episode, show: string, art: string | null) =>
    play({ url: ep.audioUrl, title: ep.title, show, art: ep.image || art });

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <Navbar />
      <main className={`app-shell-wide py-8 space-y-6 ${now ? "pb-40 sm:pb-28" : "pb-24 sm:pb-8"}`}>
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Headphones className="w-7 h-7 text-fuchsia-500" /> Podcasts
          </h1>
          <p className="text-sm text-gray-500 dark:text-white/40">
            The shows worth following across Solana &amp; crypto — play the latest episodes right here.
          </p>
        </header>

        <div className="grid sm:grid-cols-2 gap-3">
          {PODS.map((p) => {
            const st = shows[p.title];
            const open = expanded.has(p.title);
            return (
              <div
                key={p.title}
                className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-4 flex flex-col gap-3 hover:border-black/20 dark:hover:border-white/20 transition"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0 overflow-hidden ${p.accent}`}>
                    {st?.art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={st.art} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials(p.title)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold truncate">{p.title}</h2>
                    <p className="text-xs text-gray-500 dark:text-white/40 truncate">{p.host}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${TAG_COLOR[p.tag] ?? "text-gray-500 bg-black/5 dark:bg-white/10"}`}>
                    {p.tag}
                  </span>
                </div>

                <p className="text-sm text-gray-600 dark:text-white/60 leading-snug flex-1">{p.desc}</p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onListen(p)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white text-xs font-semibold transition active:scale-[0.98]"
                  >
                    {st?.loading ? (
                      <Spinner size={16} className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    Listen
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <PlatformLink href={p.spotifyUrl ?? spotify(p.title)} label="Spotify">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.38-1.32 9.84-.66 13.56 1.62.36.18.54.84.18 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.66-1.56.36z"/></svg>
                    </PlatformLink>
                    <PlatformLink href={apple(p.title)} label="Apple Podcasts">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-4 19.17V18a4 4 0 118 0v3.17A10 10 0 0012 2zm0 4a3 3 0 110 6 3 3 0 010-6zm0 8c1.66 0 3 1.12 3 2.5V20a3 3 0 01-6 0v-3.5c0-1.38 1.34-2.5 3-2.5z"/></svg>
                    </PlatformLink>
                    <PlatformLink href={youtube(p.title)} label="YouTube">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/></svg>
                    </PlatformLink>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-black/10 dark:border-white/10 pt-2 -mx-1">
                    {st?.loading && (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400 dark:text-white/40">
                        <Spinner size={16} className="w-4 h-4" /> Loading episodes…
                      </div>
                    )}
                    {st && !st.loading && st.episodes.length === 0 && (
                      <p className="py-3 px-1 text-xs text-gray-400 dark:text-white/40">
                        Couldn&apos;t load episodes. Try a platform link instead.
                      </p>
                    )}
                    {st?.episodes.map((ep) => {
                      const active = isCurrent(ep.audioUrl);
                      return (
                        <button
                          key={ep.audioUrl}
                          onClick={() =>
                            active ? toggle() : playEpisode(ep, p.title, st.art)
                          }
                          className={`w-full flex items-center gap-3 px-1.5 py-2 rounded-lg text-left transition hover:bg-black/5 dark:hover:bg-white/5 ${active ? "bg-fuchsia-500/10" : ""}`}
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${active ? "bg-fuchsia-500 text-white" : "bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60"}`}>
                            {active && playing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={`block text-xs font-medium truncate ${active ? "text-fuchsia-600 dark:text-fuchsia-400" : ""}`}>{ep.title}</span>
                            <span className="block text-[11px] text-gray-400 dark:text-white/35">
                              {fmtDate(ep.pubDate)}{ep.duration ? ` · ${ep.duration}` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
          Episodes stream from each show&apos;s official feed. Hit a platform icon to subscribe.
        </p>
      </main>
    </div>
  );
}
