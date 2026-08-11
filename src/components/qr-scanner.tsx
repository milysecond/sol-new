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

async function decodeImageSource(source: ImageBitmapSource): Promise<string | null> {
  const BD = getBarcodeDetector();
  if (!BD) return null;
  const detector = new BD({ formats: ["qr_code"] });
  const codes = await detector.detect(source);
  return codes[0]?.rawValue?.trim() || null;
}

/**
 * Continuous QR scanner via BarcodeDetector when camera stream works.
 * In Telegram / in-app browsers: photo capture + Open in Safari (stream blocked).
 */
export function QrScanner({ onScan, active = true, className = "" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<string>("");
  const lastAtRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [inApp] = useState(() => isInAppBrowser());
  const [noStream] = useState(() => !canGetUserMedia());
  const [decoding, setDecoding] = useState(false);

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
  }, []);

  const emit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const now = Date.now();
      if (t === lastRef.current && now - lastAtRef.current < 2500) return;
      lastRef.current = t;
      lastAtRef.current = now;
      onScan(t);
    },
    [onScan],
  );

  const start = useCallback(async () => {
    setError(null);
    if (!canGetUserMedia()) {
      setError(
        inApp
          ? "Telegram (and other in-app browsers) block the live camera. Take a photo of the QR, or open sol.new in Safari."
          : "Camera not available. Take a photo of the QR or paste the pay link.",
      );
      return;
    }

    setStarting(true);
    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchOk(Boolean(caps?.torch));

      const video = videoRef.current;
      if (!video) throw new Error("Video element missing");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();
      setRunning(true);

      const BD = getBarcodeDetector();
      if (!BD) {
        setError(
          "This browser can’t decode QR live. Use Take photo, or open in Safari.",
        );
        setStarting(false);
        return;
      }

      const detector = new BD({ formats: ["qr_code"] });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState >= 2 && ctx) {
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (w > 0 && h > 0) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            try {
              const codes = await detector.detect(canvas);
              if (codes[0]?.rawValue) emit(codes[0].rawValue);
            } catch {
              /* frame skip */
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
  }, [emit, inApp, stop]);

  useEffect(() => {
    // Don't auto-start stream inside Telegram — it fails and confuses users
    if (!active) {
      stop();
      return;
    }
    if (inApp || noStream) {
      setError(
        inApp
          ? "Telegram blocks live camera. Tap Take photo to scan the QR, or Open in Safari for live scan."
          : "Camera stream unavailable. Take a photo of the QR instead.",
      );
      return;
    }
    void start();
    return stop;
  }, [active, inApp, noStream, start, stop]);

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
      if (!getBarcodeDetector()) {
        setError(
          "This browser can’t decode QR from photos. Open sol.new in Safari, or paste the pay link.",
        );
        return;
      }
      const bitmap = await createImageBitmap(file);
      const value = await decodeImageSource(bitmap);
      bitmap.close();
      if (value) emit(value);
      else setError("No QR code found. Fill the frame and try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image");
    } finally {
      setDecoding(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openInSafari = () => {
    const url = typeof window !== "undefined" ? window.location.href : "https://sol.new/pay";
    // Telegram WebApp API
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
    // iOS: // opens outside sometimes; fallback copy
    window.open(url, "_blank", "noopener,noreferrer");
    try {
      void navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const showLivePreview = !inApp && !noStream;

  return (
    <div className={`space-y-3 ${className}`}>
      {showLivePreview ? (
        <div className="relative aspect-[3/4] max-h-[420px] w-full overflow-hidden rounded-2xl bg-black border border-black/10 dark:border-white/10">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            muted
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[70%] max-w-[240px] aspect-square rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-white/90 bg-black/50 rounded-full px-2.5 py-1">
              {running ? "Point at Solana Pay QR" : starting ? "Starting camera…" : "Camera off"}
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
            {inApp ? "You’re in Telegram" : "Live camera unavailable"}
          </p>
          <p className="text-xs text-gray-600 dark:text-white/55 leading-relaxed">
            {inApp
              ? "Telegram blocks the live camera on sol.new. Snap a photo of the merchant QR, or open this page in Safari for live scan."
              : "Use the camera shutter below to photograph the QR code."}
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

      {/* Primary path in Telegram: system camera via capture */}
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
          // Library pick — clear capture so gallery works
          fileRef.current.removeAttribute("capture");
          fileRef.current.click();
          // restore capture for next "take photo"
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
