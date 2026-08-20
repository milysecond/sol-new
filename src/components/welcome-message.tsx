"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import { X, Volume2, Play } from "lucide-react";

const WELCOME_KEY = "sol-new-welcomed";

type Line = { text: string; numbered: boolean; num?: number; tip?: boolean; rich?: React.ReactNode };

const lines: Line[] = [
  { text: "Welcome to sol.new!", numbered: false },
  { text: "Create a wallet.", numbered: true, num: 1 },
  { text: "Get USDC via Bridge, or ask a friend to send SOL.", numbered: true, num: 2 },
  { text: "Create a token or NFT!", numbered: true, num: 3 },
  { text: "Not ready to start? Click LIVE to switch to test mode and get some test SOL to play with.", numbered: false, tip: true },
];

// Context so other components can trigger the welcome
const WelcomeContext = createContext<{ show: () => void }>({ show: () => {} });
export const useWelcome = () => useContext(WelcomeContext);

export function WelcomeProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const show = () => setVisible(true);
  // Welcome modal is now manual-only — triggered by GetStarted, not auto-popped.
  // First-time users see a single clear CTA instead of an autopopping modal.

  return (
    <WelcomeContext.Provider value={{ show }}>
      {children}
      {visible && <WelcomeModal onDismiss={() => setVisible(false)} />}
    </WelcomeContext.Provider>
  );
}

function WelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  const [activeLine, setActiveLine] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [exiting, setExiting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const playAudio = () => {
    const audio = new Audio("/welcome.mp3");
    audioRef.current = audio;
    setPlaying(true);
    setActiveLine(0);

    audio.play().catch(() => {});
    audio.onended = () => setPlaying(false);

    // Animate lines roughly synced to speech
    const timings = [0, 1500, 3000, 6000, 8000];
    timersRef.current = timings.map((ms, i) =>
      setTimeout(() => setActiveLine(i), ms)
    );
  };

  const dismiss = () => {
    setExiting(true);
    if (audioRef.current) audioRef.current.pause();
    timersRef.current.forEach(clearTimeout);
    localStorage.setItem(WELCOME_KEY, "1");
    setTimeout(() => onDismiss(), 300);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 transition-opacity duration-300 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl transition-all duration-300 ${
          exiting ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 p-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition cursor-pointer"
        >
          <X className="w-4 h-4 text-gray-400 dark:text-white/40" />
        </button>

        {/* Play button — required for browser audio policy */}
        {!playing && activeLine < 0 && (
          <div className="flex flex-col items-center gap-3 mb-6">
            <button
              onClick={playAudio}
              className="w-16 h-16 rounded-full bg-purple-500 hover:bg-purple-400 text-white flex items-center justify-center shadow-lg shadow-purple-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer animate-pulse"
            >
              <Play className="w-7 h-7 fill-current ml-1" />
            </button>
            <span className="text-sm font-medium text-purple-500 dark:text-purple-400">Tap to play</span>
          </div>
        )}

        {playing && (
          <div className="flex flex-col items-center gap-3 mb-6">
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  setPlaying(false);
                }
              }}
              className="w-16 h-16 rounded-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-500 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Volume2 className="w-7 h-7 animate-pulse" />
            </button>
            <span className="text-sm font-medium text-purple-500 dark:text-purple-400">Tap to pause</span>
          </div>
        )}

        {!playing && activeLine >= 0 && (
          <div className="flex flex-col items-center gap-3 mb-6">
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.play().catch(() => {});
                  setPlaying(true);
                }
              }}
              className="w-16 h-16 rounded-full bg-purple-500 hover:bg-purple-400 text-white flex items-center justify-center shadow-lg shadow-purple-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Play className="w-7 h-7 fill-current ml-1" />
            </button>
            <span className="text-sm font-medium text-purple-500 dark:text-purple-400">Tap to resume</span>
          </div>
        )}

        {/* Lines */}
        <div className="space-y-2">
          {lines.map((line, i) => {
            const isVisible = activeLine < 0 || i <= activeLine;
            const isTitle = i === 0;
            const isTip = line.tip;
            let colorClass: string;
            if (!isVisible) {
              colorClass = "text-gray-300 dark:text-white/10 opacity-0 translate-y-2";
            } else if (isTitle) {
              colorClass = "text-purple-500 dark:text-purple-400 font-semibold text-base";
            } else if (isTip) {
              colorClass = "text-amber-600 dark:text-amber-400 italic";
            } else {
              colorClass = "text-gray-700 dark:text-white/80";
            }
            return (
              <p
                key={i}
                className={`text-sm transition-all duration-500 ${colorClass} ${isVisible ? "opacity-100 translate-y-0" : ""}`}
              >
                {line.numbered && <span className="font-semibold text-purple-500 dark:text-purple-400 mr-1.5">{line.num}.</span>}
                {line.rich || line.text}
              </p>
            );
          })}
        </div>

        <button
          onClick={dismiss}
          className="mt-5 w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer"
        >
          Let's go
        </button>
      </div>
    </div>
  );
}
