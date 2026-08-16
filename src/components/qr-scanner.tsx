"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  ExternalLink,
  Flashlight,
  FlashlightOff,
  ImagePlus,
} from "lucide-react";
import { Spinner } from "@/components/spinner";
import jsQR from "jsqr";

type Props = {
  onScan: (text: string) => void;
  active?: boolean;
  className?: string;
};

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Telegram|FBAN|FBAV|Instagram|Line\/|Twitter|Discord|Snapchat|MicroMessenger|WhatsApp/i.test(
    ua,
  );
}

function isSolNewNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.__SOLNEW_NATIVE__ === true) return true;
    if (w.__SOLNEW_APPCLIP__ === true) return true;
    if (localStorage.getItem("solnew_native") === "1") return true;
    if (document.documentElement?.dataset?.solnewAppclip === "1") return true;
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) {
    return true;
  }
  return false;
}

function canGetUserMedia(): boolean {
  try {
    return Boolean(
      typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function",
    );
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBarcodeDetector():
  | (new (opts: { formats: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
    })
  | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BD = (typeof window !== "undefined" && (window as any).BarcodeDetector) as
    | (new (opts: { formats: string[] }) => {
        detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
      })
    | undefined;
  return BD || null;
}

/** Decode QR via BarcodeDetector and/or jsQR (works on Safari/Firefox/Android). */
async function decodeFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  // 1) Native BarcodeDetector (Chrome/Android, some Safari)
  const BD = getBarcodeDetector();
  if (BD) {
    try {
      const detector = new BD({ formats: ["qr_code"] });
      const codes = await detector.detect(canvas);
      const v = codes[0]?.rawValue?.trim();
      if (v) return v;
    } catch {
      /* fall through */
    }
  }

  // 2) jsQR on full frame
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const full = jsQR(img.data, img.width, img.height, {
      inversionAttempts: "attemptBoth",
    });
    if (full?.data?.trim()) return full.data.trim();
  } catch {
    /* continue */
  }

  // 3) Center crop (viewfinder region) — QR often sits in the middle square
  try {
    const w = canvas.width;
    const h = canvas.height;
    const side = Math.floor(Math.min(w, h) * 0.72);
    const sx = Math.floor((w - side) / 2);
    const sy = Math.floor((h - side) / 2);
    const crop = ctx.getImageData(sx, sy, side, side);
    const mid = jsQR(crop.data, crop.width, crop.height, {
      inversionAttempts: "attemptBoth",
    });
    if (mid?.data?.trim()) return mid.data.trim();
  } catch {
    /* ignore */
  }

  return null;
}

async function decodeImageBitmap(bitmap: ImageBitmap): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return decodeFromCanvas(canvas);
}

/**
 * Continuous QR scanner: camera + BarcodeDetector + jsQR fallback.
 * In Telegram / in-app browsers: photo capture + Open in Safari.
 */
export function QrScanner({ onScan, active = true, className = "" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<string>("");
  const lastAtRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const lastTickRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [inApp] = useState(() => isInAppBrowser());
  const [nativeShell] = useState(() => isSolNewNativeShell());
  const [noStream] = useState(() => !canGetUserMedia());
  const [decoding, setDecoding] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) v.srcObject = null;
    setRunning(false);
    setTorch(false);
    busyRef.current = false;
  }, []);

  const emit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const now = Date.now();
      if (t === lastRef.current && now - lastAtRef.current < 2500) return;
      lastRef.current = t;
      lastAtRef.current = now;
      // Haptic
      try {
        navigator?.vibrate?.(30);
      } catch {
        /* ignore */
      }
      onScan(t);
    },
    [onScan],
  );

  const start = useCallback(async () => {
    setError(null);
    setHint(null);
    if (!canGetUserMedia()) {
      setError(
        nativeShell
          ? "Camera needs permission in Settings → sol.new → Camera. Or use Take photo of QR."
          : inApp
            ? "This in-app browser blocks the live camera. Take a photo of the QR, or open sol.new in Safari."
            : "Camera not available. Take a photo of the QR or paste the pay link.",
      );
      return;
    }

    setStarting(true);
    stop();

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        // Fallback: any camera
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchOk(Boolean(caps?.torch));

      const video = videoRef.current;
      if (!video) throw new Error("Video element missing");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.muted = true;
      video.playsInline = true;
      await video.play();
      setRunning(true);
      setHint("Hold steady — scanning…");

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      // Prefer native detector on video element when available (faster)
      const BD = getBarcodeDetector();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = BD ? new BD({ formats: ["qr_code"] }) : null;

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const now = performance.now();
        // ~6–7 fps is enough for QR and saves battery
        if (now - lastTickRef.current < 140 || busyRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
          return;
        }
        lastTickRef.current = now;

        const v = videoRef.current;
        if (v.readyState >= 2 && ctx) {
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (w > 0 && h > 0) {
            busyRef.current = true;
            try {
              // Try native on video first
              if (detector) {
                try {
                  const codes = await detector.detect(v);
                  const raw = codes[0]?.rawValue?.trim();
                  if (raw) {
                    emit(raw);
                    busyRef.current = false;
                    rafRef.current = requestAnimationFrame(() => {
                      void tick();
                    });
                    return;
                  }
                } catch {
                  /* canvas path */
                }
              }

              // Downscale large frames for jsQR speed
              const maxSide = 720;
              const scale = Math.min(1, maxSide / Math.max(w, h));
              const cw = Math.max(1, Math.floor(w * scale));
              const ch = Math.max(1, Math.floor(h * scale));
              canvas.width = cw;
              canvas.height = ch;
              ctx.drawImage(v, 0, 0, cw, ch);
              const value = await decodeFromCanvas(canvas);
              if (value) emit(value);
            } finally {
              busyRef.current = false;
            }
          }
        }
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      };
      void tick();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Camera failed";
      if (/Permission|NotAllowed|denied/i.test(msg)) {
        setError("Camera permission denied. Take a photo of the QR, or open in Safari.");
      } else if (inApp) {
        setError(
          "Live camera blocked in this app. Take a photo of the QR, or open sol.new in Safari.",
        );
      } else {
        setError(msg);
      }
      stop();
    } finally {
      setStarting(false);
    }
  }, [emit, inApp, nativeShell, stop]);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    if (inApp && !nativeShell) {
      setError(
        "In-app browsers block live camera. Tap Take photo to scan the QR, or Open in Safari.",
      );
      return;
    }
    if (noStream && !nativeShell) {
      setError("Camera stream unavailable. Take a photo of the QR instead.");
      return;
    }
    void start();
    return stop;
  }, [active, inApp, nativeShell, noStream, start, stop]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchOk) return;
    const next = !torch;
    try {
      // @ts-expect-error torch constraint
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch {
      setTorchOk(false);
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setDecoding(true);
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const value = await decodeImageBitmap(bitmap);
      bitmap.close();
      if (value) emit(value);
      else
        setError(
          "No QR code found. Fill the frame with the code, improve lighting, and try again.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image");
    } finally {
      setDecoding(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openInSafari = () => {
    const url = typeof window !== "undefined" ? window.location.href : "https://sol.new/pay";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openLink) {
        tg.openLink(url, { try_instant_view: false });
        return;
      }
    } catch {
      /* ignore */
    }
    window.open(url, "_blank", "noopener,noreferrer");
    try {
      void navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const showLivePreview = nativeShell || (!inApp && !noStream);

  return (
    <div className={`space-y-3 ${className}`}>
      {showLivePreview ? (
        <div className="relative aspect-[3/4] max-h-[420px] w-full overflow-hidden rounded-2xl bg-black border border-black/10 dark:border-white/10">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[70%] max-w-[240px] aspect-square rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-white/90 bg-black/50 rounded-full px-2.5 py-1">
              {running
                ? hint || "Point at Solana Pay QR"
                : starting
                  ? "Starting camera…"
                  : "Camera off"}
            </span>
            <div className="flex gap-1.5">
              {torchOk && running && (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  className="p-2 rounded-full bg-black/50 text-white cursor-pointer"
                  aria-label="Torch"
                >
                  {torch ? <FlashlightOff size={16} /> : <Flashlight size={16} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => (running ? stop() : void start())}
                className="p-2 rounded-full bg-black/50 text-white cursor-pointer"
                aria-label={running ? "Stop camera" : "Start camera"}
              >
                {running ? <CameraOff size={16} /> : <Camera size={16} />}
              </button>
            </div>
          </div>
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Spinner size={28} className="text-white" />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 px-4 py-5 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {inApp ? "In-app browser" : "Live camera unavailable"}
          </p>
          <p className="text-xs text-gray-600 dark:text-white/55 leading-relaxed">
            {inApp
              ? "This browser blocks the live camera. Snap a photo of the merchant QR, or open sol.new in Safari."
              : "Use Take photo to photograph the QR code."}
          </p>
          {inApp && (
            <button
              type="button"
              onClick={openInSafari}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-white/15 border border-black/10 dark:border-white/15 py-3 text-sm font-semibold text-gray-900 dark:text-white cursor-pointer"
            >
              <ExternalLink size={16} />
              Open in Safari
            </button>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0] || null)}
      />

      <button
        type="button"
        disabled={decoding}
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3.5 transition cursor-pointer"
      >
        {decoding ? <Spinner size={18} /> : <Camera size={18} />}
        {decoding ? "Reading QR…" : "Take photo of QR"}
      </button>

      <button
        type="button"
        disabled={decoding}
        onClick={() => {
          if (!fileRef.current) return;
          fileRef.current.removeAttribute("capture");
          fileRef.current.click();
          setTimeout(() => {
            fileRef.current?.setAttribute("capture", "environment");
          }, 500);
        }}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 dark:border-white/15 py-3 text-sm text-gray-600 dark:text-white/55 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition"
      >
        <ImagePlus size={16} />
        Choose from photos
      </button>

      {error && (
        <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}
