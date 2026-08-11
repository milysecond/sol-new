"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Flashlight, FlashlightOff } from "lucide-react";
import { Spinner } from "@/components/spinner";

type Props = {
  onScan: (text: string) => void;
  active?: boolean;
  className?: string;
};

/**
 * Continuous QR scanner via BarcodeDetector (Safari 17+ / Chrome).
 * Falls back to file-picker if camera/API unavailable.
 */
export function QrScanner({ onScan, active = true, className = "" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<string>("");
  const lastAtRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchOk, setTorchOk] = useState(false);

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
    if (v) {
      v.srcObject = null;
    }
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
    setStarting(true);
    stop();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera not available in this browser");
      }

      // BarcodeDetector is ideal; without it we still show camera + manual paste UX
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const BD = (window as any).BarcodeDetector as
        | (new (opts: { formats: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
          })
        | undefined;

      if (!BD) {
        setError("Live QR decode needs Safari 17+ or Chrome. Paste the pay link below, or use the photo button.");
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
      setError(
        /Permission|NotAllowed|denied/i.test(msg)
          ? "Camera permission denied. Allow camera, or paste the Solana Pay link."
          : msg,
      );
      stop();
    } finally {
      setStarting(false);
    }
  }, [emit, stop]);

  useEffect(() => {
    if (active) void start();
    else stop();
    return stop;
  }, [active, start, stop]);

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
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const BD = (window as any).BarcodeDetector as
        | (new (opts: { formats: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
          })
        | undefined;
      if (!BD) {
        setError("This browser can’t decode QR from photos. Paste the pay link instead.");
        return;
      }
      const bitmap = await createImageBitmap(file);
      const detector = new BD({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      bitmap.close();
      if (codes[0]?.rawValue) emit(codes[0].rawValue);
      else setError("No QR code found in that image.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image");
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative aspect-[3/4] max-h-[420px] w-full overflow-hidden rounded-2xl bg-black border border-black/10 dark:border-white/10">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
        />
        {/* viewfinder */}
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

      <label className="flex items-center justify-center gap-2 w-full rounded-xl border border-dashed border-black/15 dark:border-white/15 py-3 text-sm text-gray-600 dark:text-white/55 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition">
        <Camera size={16} />
        Upload QR photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] || null)}
        />
      </label>

      {error && (
        <p className="text-xs text-amber-700 dark:text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
