"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Download, ImagePlus, Link2, RotateCcw, Share2 } from "lucide-react";

/**
 * LinkedIn frame = circular photo + fixed #OPENTOSOLANA arc overlay PNG.
 * Overlay asset: /frame/opentosolana-overlay.png (black → transparent).
 */

const SIZE = 1080;
const OVERLAY_SRC = "/frame/opentosolana-overlay.png?v=4";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = "#000000";
  const headR = r * 0.32;
  const headCy = cy - r * 0.18;
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.82, cy + r + 2);
  ctx.bezierCurveTo(
    cx - r * 0.8,
    cy + r * 0.08,
    cx - r * 0.42,
    cy - r * 0.02,
    cx - headR * 0.55,
    headCy + headR * 1.0
  );
  ctx.quadraticCurveTo(cx, headCy + headR * 1.55, cx + headR * 0.55, headCy + headR * 1.0);
  ctx.bezierCurveTo(
    cx + r * 0.42,
    cy - r * 0.02,
    cx + r * 0.8,
    cy + r * 0.08,
    cx + r * 0.82,
    cy + r + 2
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFrame(
  canvas: HTMLCanvasElement,
  opts: {
    photo: HTMLImageElement | null;
    overlay: HTMLImageElement | null;
    photoZoom: number;
    photoOffsetX: number;
    photoOffsetY: number;
  }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const s = SIZE;
  canvas.width = s;
  canvas.height = s;
  const cx = s / 2;
  const cy = s / 2;
  ctx.clearRect(0, 0, s, s);

  // Full-bleed circular photo under the overlay
  const photoR = s / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.clip();

  if (opts.photo) {
    const img = opts.photo;
    const zoom = clamp(opts.photoZoom, 0.5, 4);
    const side = Math.min(img.width, img.height) / zoom;
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const ox = opts.photoOffsetX * photoR;
    const oy = opts.photoOffsetY * photoR;
    ctx.drawImage(
      img,
      sx,
      sy,
      side,
      side,
      cx - photoR + ox,
      cy - photoR + oy,
      photoR * 2,
      photoR * 2
    );
  } else {
    drawSilhouette(ctx, cx, cy, photoR);
  }
  ctx.restore();

  // Official arc overlay — exact asset, full canvas
  if (opts.overlay) {
    ctx.drawImage(opts.overlay, 0, 0, s, s);
  }
}

export function FrameStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  const [overlay, setOverlay] = useState<HTMLImageElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1.05);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  // Load fixed overlay once
  useEffect(() => {
    let cancelled = false;
    loadImage(OVERLAY_SRC)
      .then((img) => {
        if (!cancelled) setOverlay(img);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!photoUrl) {
      setPhoto(null);
      return;
    }
    loadImage(photoUrl)
      .then((img) => {
        if (!cancelled) setPhoto(img);
      })
      .catch(() => {
        if (!cancelled) setPhoto(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    drawFrame(c, {
      photo,
      overlay,
      photoZoom,
      photoOffsetX,
      photoOffsetY,
    });
  }, [photo, overlay, photoZoom, photoOffsetX, photoOffsetY]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const onFile = (file: File | null) => {
    if (!file?.type.startsWith("image/")) {
      if (file) setShareMsg("Use an image file (JPG/PNG).");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setPhotoZoom(1.05);
    setShareMsg(null);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!photo) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: photoOffsetX,
      oy: photoOffsetY,
    };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const dx = ((e.clientX - d.x) * scale) / (SIZE * 0.45);
    const dy = ((e.clientY - d.y) * scale) / (SIZE * 0.45);
    setPhotoOffsetX(clamp(d.ox + dx, -1.3, 1.3));
    setPhotoOffsetY(clamp(d.oy + dy, -1.3, 1.3));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const onWheel = (e: ReactWheelEvent) => {
    if (!photo) return;
    e.preventDefault();
    setPhotoZoom((z) => clamp(z * (e.deltaY > 0 ? 0.94 : 1.06), 0.5, 4));
  };

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    redraw();
    const a = document.createElement("a");
    a.download = "sol-new-opentosolana-frame.png";
    a.href = c.toDataURL("image/png");
    a.click();
  };

  const shareLink = async () => {
    const url = "https://sol.new/frame";
    try {
      if (navigator.share) {
        await navigator.share({ title: "#OPENTOSOLANA frame", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied.");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Link copied.");
      } catch {
        setShareMsg(url);
      }
    }
  };

  const reset = () => {
    setPhotoZoom(1.05);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setPhoto(null);
    setShareMsg(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2">
        <div
          className={`relative w-full max-w-[min(100%,400px)] touch-none select-none ${
            photo ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="mx-auto block h-auto w-full rounded-full bg-black"
            aria-label="#OPENTOSOLANA LinkedIn frame"
          />
        </div>
        <p className="text-center text-[13px] leading-snug text-gray-500 dark:text-white/45">
          <span className="mr-1" aria-hidden>
            ✊
          </span>
          Drag photo to position · scroll to zoom
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-3 text-sm font-medium hover:bg-black/[0.05] dark:border-white/20 dark:bg-white/5"
      >
        <ImagePlus size={18} />
        {photo ? "Change photo" : "Upload profile photo"}
      </button>

      <div className="flex flex-col gap-2.5 pt-1">
        <button
          type="button"
          onClick={download}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0A66C2] px-4 py-3.5 text-[17px] font-semibold text-white shadow-sm hover:bg-[#004182] active:scale-[0.99]"
        >
          <Download size={20} strokeWidth={2.5} />
          Download
        </button>
        <button
          type="button"
          onClick={shareLink}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0A66C2] px-4 py-3.5 text-[17px] font-semibold text-white shadow-sm hover:bg-[#004182] active:scale-[0.99]"
        >
          <Share2 size={20} strokeWidth={2.5} />
          Share Frame
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-black/10 py-2.5 text-sm font-medium text-gray-600 hover:bg-black/5 dark:border-white/15 dark:text-white/70"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      {shareMsg && (
        <p className="flex items-start gap-2 break-all text-xs text-gray-600 dark:text-white/60">
          <Link2 size={14} className="mt-0.5 shrink-0" />
          {shareMsg}
        </p>
      )}
    </div>
  );
}
