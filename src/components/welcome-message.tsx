"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import { X, Volume2, Play } from "lucide-react";

const WELCOME_KEY = "sol-new-welcomed";

const ApplePayIcon = () => (
  <svg className="inline-block h-6 align-middle mx-0.5" viewBox="0 0 576 512" fill="currentColor" aria-label="Apple Pay">
    <path d="M302.2 218.4c0 17.2-10.5 27.1-29 27.1h-24.3v-54.2h24.4c18.4 0 28.9 9.8 28.9 27.1zm47.5 62.6c0 8.3 7.2 13.7 18.5 13.7 14.4 0 25.2-9.1 25.2-21.9v-7.7l-23.5 1.5c-13.3.9-20.2 5.8-20.2 14.4zM576 79v352c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V79c0-26.5 21.5-48 48-48h480c26.5 0 48 21.5 48 48zM127.8 197.2c8.4.7 16.8-4.2 22.1-10.4 5.2-6.4 8.6-15 7.7-23.7-7.4.3-16.6 4.9-21.9 11.3-4.8 5.5-8.9 14.4-7.9 22.8zm60.6 74.5c-.2-.2-19.6-7.6-19.8-30-.2-18.7 15.3-27.7 16-28.2-8.8-13-22.4-14.4-27.1-14.7-12.2-.7-22.6 6.9-28.4 6.9-5.9 0-14.7-6.6-24.3-6.4-12.5.2-24.2 7.3-30.5 18.6-13.1 22.6-3.4 56 9.3 74.4 6.2 9.1 13.7 19.1 23.5 18.7 9.3-.4 13-6 24.2-6 11.3 0 14.5 6 24.3 5.9 10.2-.2 16.5-9.1 22.8-18.2 6.9-10.4 9.8-20.4 10-21zm135.4-53.4c0-26.6-18.5-44.8-44.9-44.8h-51.2v136.4h21.2v-46.6h29.3c26.8 0 45.6-18.4 45.6-45zm90 23.7c0-19.7-15.8-32.4-40-32.4-22.5 0-39.1 12.9-39.7 30.5h19.1c1.6-8.4 9.4-13.9 20-13.9 13 0 20.2 6 20.2 17.2v7.5l-26.4 1.6c-24.6 1.5-37.9 11.6-37.9 29.1 0 17.7 13.7 29.4 33.4 29.4 13.3 0 25.6-6.7 31.2-17.4h.4V310h19.6v-68zM516 210.9h-21.5l-24.9 80.6h-.4l-24.9-80.6H422l35.9 99.3-1.9 6c-3.2 10.2-8.5 14.2-17.9 14.2-1.7 0-4.9-.2-6.2-.3v16.4c1.2.4 6.5.5 8.1.5 20.7 0 30.4-7.9 38.9-31.8L516 210.9z"/>
  </svg>
);

const GooglePayIcon = () => (
  <svg className="inline-block h-6 align-middle mx-0.5" viewBox="0 0 640 512" fill="currentColor" aria-label="Google Pay">
    <path d="M105.72,215v41.25h57.1a49.66,49.66,0,0,1-21.14,32.6c-9.54,6.55-21.72,10.28-36,10.28-27.6,0-50.93-18.91-59.3-44.22a65.61,65.61,0,0,1,0-41l0,0c8.37-25.46,31.7-44.37,59.3-44.37a56.43,56.43,0,0,1,40.51,16.08L176.47,155a101.24,101.24,0,0,0-70.75-27.84,105.55,105.55,0,0,0-94.38,59.11,107.64,107.64,0,0,0,0,96.18v.15a105.41,105.41,0,0,0,94.38,59c28.47,0,52.55-9.53,70-25.91,20-18.61,31.41-46.15,31.41-78.91A133.76,133.76,0,0,0,205.38,215Zm389.41-4c-10.13-9.38-23.93-14.14-41.39-14.14-22.46,0-39.34,8.34-50.5,24.86l20.85,13.26q11.45-17,31.26-17a34.05,34.05,0,0,1,22.75,8.79A28.14,28.14,0,0,1,487.79,248v5.51c-9.1-5.07-20.55-7.75-34.64-7.75-16.44,0-29.65,3.88-39.49,11.77s-14.82,18.31-14.82,31.56a39.74,39.74,0,0,0,13.94,31.27c9.25,8.34,21,12.51,34.79,12.51,16.29,0,29.21-7.3,39-21.89h1v17.72h22.61V250C510.25,233.45,505.26,220.34,495.13,211ZM475.9,300.3a37.32,37.32,0,0,1-26.57,11.16A28.61,28.61,0,0,1,431,305.21a19.41,19.41,0,0,1-7.77-15.63c0-7,3.22-12.81,9.54-17.42s14.53-7,24.07-7C470,265,480.3,268,487.64,273.94,487.64,284.07,483.68,292.85,475.9,300.3Zm-93.65-142A55.71,55.71,0,0,0,341.74,142H279.07V328.74H302.7V253.1h39c16,0,29.5-5.36,40.51-15.93.88-.89,1.76-1.79,2.65-2.68A54.45,54.45,0,0,0,382.25,158.26Zm-16.58,62.23a30.65,30.65,0,0,1-23.34,9.68H302.7V165h39.63a32,32,0,0,1,22.6,9.23A33.18,33.18,0,0,1,365.67,220.49ZM614.31,201,577.77,292.7h-.45L539.9,201H514.21L566,320.55l-29.35,64.32H561L640,201Z"/>
  </svg>
);

type Line = { text: string; numbered: boolean; num?: number; tip?: boolean; rich?: React.ReactNode };

const lines: Line[] = [
  { text: "Welcome to sol.new!", numbered: false },
  { text: "Create a wallet.", numbered: true, num: 1 },
  { text: "", numbered: true, num: 2, rich: <>Get SOL with <ApplePayIcon /> <GooglePayIcon /> or ask a friend to send it.</> },
  { text: "Create a token or NFT!", numbered: true, num: 3 },
  { text: "Not ready to start? Click LIVE to switch to test mode and get some test SOL to play with.", numbered: false, tip: true },
];

// Context so other components can trigger the welcome
const WelcomeContext = createContext<{ show: () => void }>({ show: () => {} });
export const useWelcome = () => useContext(WelcomeContext);

export function WelcomeProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const show = () => setVisible(true);

  // Auto-show for first timers (after splash)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(WELCOME_KEY)) return;
    // Small delay to let splash finish
    const t = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);

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
          className="mt-5 w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer"
        >
          Let's go
        </button>
      </div>
    </div>
  );
}
