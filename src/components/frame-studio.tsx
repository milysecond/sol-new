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
 * LinkedIn #OpenToWork–style frame (matches frame-generator #OPENTOSOLANA):
 * large photo, thin black outer circle, thick purple→red gradient ARC on
 * left→bottom only, white bold text on the arc (tops toward center).
 */

const SIZE = 1080;
const DEFAULT_TEXT = "#OPENTOSOLANA";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
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
    text: string;
    textOffsetDeg: number;
    textCenterOffset: number;
    cubicle: boolean;
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

  // Geometry tuned against frame-generator reference
  const rim = s * 0.02;
  const outerR = s * 0.49;
  const bandW = s * 0.13;
  // Photo nearly fills the circle; band overlays the perimeter
  const photoR = outerR - rim * 0.65;
  const midR = photoR - bandW * 0.12;

  // CCW arc: ~10 o'clock → ~4 o'clock through left & bottom
  const offset = (opts.textOffsetDeg * Math.PI) / 180;
  const bandStart = (205 * Math.PI) / 180 + offset;
  const bandEnd = (38 * Math.PI) / 180 + offset;

  // --- Photo ---
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

  // Soft bloom behind arc
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, midR, bandStart, bandEnd, true);
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = bandW + s * 0.028;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Gradient arc (purple left → red bottom)
  const g = ctx.createLinearGradient(
    cx + Math.cos(bandStart) * midR,
    cy + Math.sin(bandStart) * midR,
    cx + Math.cos(Math.PI / 2) * midR,
    cy + Math.sin(Math.PI / 2) * midR
  );
  g.addColorStop(0, "#5B21B6");
  g.addColorStop(0.28, "#9333EA");
  g.addColorStop(0.52, "#E11D8A");
  g.addColorStop(0.78, "#EF4444");
  g.addColorStop(1, "#DC2626");

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, midR, bandStart, bandEnd, true);
  ctx.strokeStyle = g;
  ctx.lineWidth = bandW;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Outer black ring (on top)
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = rim;
  ctx.stroke();

  // --- Text on arc ---
  const raw = (opts.text || DEFAULT_TEXT).replace(/\s+/g, "").toUpperCase();
  const fontSize = bandW * 0.52;
  const textR = midR + opts.textCenterOffset * (bandW * 0.2);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${fontSize}px "Arial Black","Helvetica Neue",Arial,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const tracking = fontSize * 0.025;
  const chars = [...raw];
  const widths = chars.map((ch) => ctx.measureText(ch).width + tracking);
  const totalW = Math.max(
    widths.reduce((a, b) => a + b, 0) - tracking,
    1
  );

  // CCW span
  let span = bandStart - bandEnd;
  if (span <= 0) span += Math.PI * 2;

  const centerAngle = bandStart - 0.52 * span;
  // Place chars along CCW path (angle decreases)
  let ang = centerAngle + totalW / 2 / textR;

  for (let i = 0; i < chars.length; i++) {
    const w = widths[i];
    const step = w / textR;
    const mid = ang - step / 2;

    ctx.save();
    ctx.translate(cx + Math.cos(mid) * textR, cy + Math.sin(mid) * textR);
    // Tops toward center
    ctx.rotate(mid - Math.PI / 2);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();

    ang -= step;
  }
  ctx.restore();

  if (opts.cubicle) {
    const R = outerR + rim * 0.5;
    const rad = R * 0.12;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = rim * 0.85;
    const x = cx - R;
    const y = cy - R;
    const w = R * 2;
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + w, rad);
    ctx.arcTo(x + w, y + w, x, y + w, rad);
    ctx.arcTo(x, y + w, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
    ctx.stroke();
  }
}

function readHash(): Partial<{
  text: string;
  textOffset: number;
  textCenter: number;
  cubicle: boolean;
}> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return {};
    const q = new URLSearchParams(raw.includes("=") ? raw : `text=${raw}`);
    const out: {
      text?: string;
      textOffset?: number;
      textCenter?: number;
      cubicle?: boolean;
    } = {};
    const t = q.get("text");
    if (t) out.text = t;
    const o = q.get("offset");
    if (o != null && o !== "" && !Number.isNaN(Number(o))) out.textOffset = Number(o);
    const c = q.get("center");
    if (c != null && c !== "" && !Number.isNaN(Number(c)))
      out.textCenter = clamp(Number(c), -1, 1);
    if (q.get("cubicle") === "1") out.cubicle = true;
    return out;
  } catch {
    return {};
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

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [textOffset, setTextOffset] = useState(0);
  const [textCenter, setTextCenter] = useState(0);
  const [cubicle, setCubicle] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(1.05);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    const d = readHash();
    if (d.text) setText(d.text);
    if (typeof d.textOffset === "number") setTextOffset(d.textOffset);
    if (typeof d.textCenter === "number") setTextCenter(d.textCenter);
    if (d.cubicle) setCubicle(true);
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
      text,
      textOffsetDeg: textOffset,
      textCenterOffset: textCenter,
      cubicle,
      photoZoom,
      photoOffsetX,
      photoOffsetY,
    });
  }, [
    photo,
    text,
    textOffset,
    textCenter,
    cubicle,
    photoZoom,
    photoOffsetX,
    photoOffsetY,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const q = new URLSearchParams();
    q.set("text", text);
    if (textOffset) q.set("offset", String(Math.round(textOffset)));
    if (textCenter) q.set("center", textCenter.toFixed(2));
    if (cubicle) q.set("cubicle", "1");
    const next = `#${q.toString()}`;
    if (typeof window !== "undefined" && window.location.hash !== next) {
      history.replaceState(null, "", `${window.location.pathname}${next}`);
    }
  }, [text, textOffset, textCenter, cubicle]);

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
    a.download = "sol-new-frame.png";
    a.href = c.toDataURL("image/png");
    a.click();
  };

  const shareLink = async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : "https://sol.new/frame";
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
    setText(DEFAULT_TEXT);
    setTextOffset(0);
    setTextCenter(0);
    setCubicle(false);
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
      <div className="space-y-4 rounded-2xl border border-black/[0.06] bg-white px-4 py-4 dark:border-white/10 dark:bg-zinc-950">
        <label className="flex items-center justify-between gap-3 text-[15px] font-medium text-gray-800 dark:text-white/90">
          <span>Text Offset</span>
          <input
            type="range"
            min={-80}
            max={80}
            value={textOffset}
            onChange={(e) => setTextOffset(Number(e.target.value))}
            className="h-2 w-[58%] max-w-[240px] cursor-pointer appearance-none rounded-full bg-gradient-to-r from-sky-200 to-blue-600"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-[15px] font-medium text-gray-800 dark:text-white/90">
          <span>Text Center offset</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={Math.round(textCenter * 100)}
            onChange={(e) => setTextCenter(Number(e.target.value) / 100)}
            className="h-2 w-[58%] max-w-[240px] cursor-pointer appearance-none rounded-full bg-gradient-to-r from-sky-200 to-blue-600"
          />
        </label>
        <div className="flex items-center justify-between gap-3 text-[15px] font-medium text-gray-800 dark:text-white/90">
          <span>Cubicle</span>
          <button
            type="button"
            role="switch"
            aria-checked={cubicle}
            onClick={() => setCubicle((v) => !v)}
            className={`relative h-8 w-[3.25rem] rounded-full transition-colors ${
              cubicle ? "bg-emerald-500" : "bg-gray-200 dark:bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[9px] font-extrabold shadow transition-all ${
                cubicle ? "left-[1.35rem] text-emerald-600" : "left-0.5 text-rose-500"
              }`}
            >
              {cubicle ? "YES" : "NO"}
            </span>
          </button>
        </div>
      </div>

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
            className="mx-auto block h-auto w-full bg-transparent"
            aria-label="LinkedIn open-to-work style frame"
          />
        </div>
        <p className="text-center text-[13px] leading-snug text-gray-500 dark:text-white/45">
          <span className="mr-1" aria-hidden>
            ✊
          </span>
          Drag the image to position it.
          <br />
          Use scroll / pinch to resize.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="frame-text" className="text-sm font-medium">
          Frame text
        </label>
        <input
          id="frame-text"
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-base font-bold tracking-wide outline-none focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-black"
          placeholder="#OPENTOSOLANA"
          maxLength={28}
          spellCheck={false}
        />
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
