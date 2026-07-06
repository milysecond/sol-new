"use client";

// Global podcast player. Mounted once in the root layout so the <audio> element
// and now-playing state survive client-side navigation — start an episode on
// /pods and it keeps playing as you move around the app.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Headphones, Play, Pause, X } from "lucide-react";

export type Track = { url: string; title: string; show: string; art: string | null };

type PodPlayerCtx = {
  now: Track | null;
  playing: boolean;
  play: (t: Track) => void;
  toggle: () => void;
  isCurrent: (url: string) => boolean;
};

const Ctx = createContext<PodPlayerCtx | null>(null);

export function usePodPlayer(): PodPlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePodPlayer must be used within <PodPlayerProvider>");
  return c;
}

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

export function PodPlayerProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const play = (t: Track) => {
    setNow(t);
    setPlaying(true);
  };
  const toggle = () => {
    if (now) setPlaying((p) => !p);
  };
  const isCurrent = (url: string) => now?.url === url;

  // Drive the single <audio> element from now/playing.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !now) return;
    if (a.src !== now.url) {
      a.src = now.url;
      setTime(0);
      setDur(0);
    }
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [now, playing]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Number(e.target.value);
    setTime(a.currentTime);
  };

  const close = () => {
    audioRef.current?.pause();
    setNow(null);
    setPlaying(false);
  };

  return (
    <Ctx.Provider value={{ now, playing, play, toggle, isCurrent }}>
      {children}

      {now && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 dark:border-white/10 bg-white/90 dark:bg-black/90 backdrop-blur-md mb-16 sm:mb-0">
          <div className="max-w-3xl mx-auto px-3 sm:px-6 py-2.5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-fuchsia-500/10 overflow-hidden shrink-0">
              {now.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={now.art} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-fuchsia-500" />
                </div>
              )}
            </div>

            <button
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="w-10 h-10 rounded-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white flex items-center justify-center shrink-0 transition active:scale-95"
            >
              {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold truncate">{now.title}</span>
                <span className="text-[11px] text-gray-400 dark:text-white/35 truncate hidden sm:inline">{now.show}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] tabular-nums text-gray-400 dark:text-white/40 w-9 text-right">{fmtTime(time)}</span>
                <input
                  type="range"
                  min={0}
                  max={dur || 0}
                  value={time}
                  onChange={seek}
                  className="flex-1 h-1 accent-fuchsia-500 cursor-pointer"
                  aria-label="Seek"
                />
                <span className="text-[10px] tabular-nums text-gray-400 dark:text-white/40 w-9">{fmtTime(dur)}</span>
              </div>
            </div>

            <button
              onClick={close}
              aria-label="Close player"
              className="w-8 h-8 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center shrink-0 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
        hidden
      />
    </Ctx.Provider>
  );
}
