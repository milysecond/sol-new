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

const SIZE = 1000;
const DEFAULT_TEXT = "#OPENTOSOLANA";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

/** Classic LinkedIn open-to-work style gradient (purple → pink → red). */
function ringGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
) {
  const g = ctx.createLinearGradient(cx - r, cy, cx + r, cy + r * 0.6);
  g.addColorStop(0, "#7C3AED"); // violet
  g.addColorStop(0.35, "#C026D3"); // fuchsia
  g.addColorStop(0.65, "#E11D48"); // rose
  g.addColorStop(1, "#DC2626"); // red
  return g;
}

/** Simple head+shoulders silhouette (placeholder). */
function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  photoR: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - photoR, cy - photoR, photoR * 2, photoR * 2);

  ctx.fillStyle = "#0a0a0a";
  // head
  const headR = photoR * 0.32;
  const headCy = cy - photoR * 0.18;
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  // shoulders / torso
  ctx.beginPath();
  ctx.moveTo(cx - photoR * 0.55, cy + photoR * 1.05);
  ctx.quadraticCurveTo(cx - photoR * 0.5, cy + photoR * 0.15, cx - headR * 0.95, headCy + headR * 0.85);
  ctx.quadraticCurveTo(cx, headCy + headR * 1.35, cx + headR * 0.95, headCy + headR * 0.85);
  ctx.quadraticCurveTo(cx + photoR * 0.5, cy + photoR * 0.15, cx + photoR * 0.55, cy + photoR * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw text once along a circular arc (not full-circle repeat).
 * Angles in radians; text is centered on `centerAngle`.
 */
function drawArcText(
  ctx: CanvasRenderingContext2D,
  opts: {
    text: string;
    cx: number;
    cy: number;
    radius: number;
    centerAngle: number;
    color: string;
    fontSize: number;
    /** false = text sits on lower arc reading upright-ish (inside ring) */
    outward?: boolean;
  }
) {
  const text = (opts.text || "").trim() || " ";
  ctx.save();
  ctx.fillStyle = opts.color;
  ctx.font = `800 ${opts.fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  // Angular span of the whole string
  const span = total / opts.radius;
  let angle = opts.centerAngle - span / 2;

  for (let i = 0; i < chars.length; i++) {
    const w = widths[i];
    const step = w / opts.radius;
    const mid = angle + step / 2;
    ctx.save();
    ctx.translate(
      opts.cx + Math.cos(mid) * opts.radius,
      opts.cy + Math.sin(mid) * opts.radius
    );
    // Rotate so baseline follows the circle; flip for lower-arc readability
    if (opts.outward) {
      ctx.rotate(mid + Math.PI / 2);
    } else {
      ctx.rotate(mid - Math.PI / 2);
    }
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle += step;
  }
  ctx.restore();
}

function drawFrame(
  canvas: HTMLCanvasElement,
  opts: {
    photo: HTMLImageElement | null;
    text: string;
    /** degrees, rotates text around ring */
    textOffsetDeg: number;
    /** -1..1 radial nudge inside the band */
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

  // Transparent outside (LinkedIn composites on white anyway)
  ctx.clearRect(0, 0, s, s);

  // Geometry matches screenshot: thick colored band, thin black outer rim
  const outerR = s * 0.48;
  const bandWidth = s * 0.105;
  const innerR = outerR - bandWidth;
  const photoR = innerR - 4;
  const blackRim = 6;

  // Outer black rim
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + blackRim / 2, 0, Math.PI * 2);
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = blackRim;
  ctx.stroke();

  // Gradient band (donut)
  ctx.beginPath();
  ctx.arc(cx, cy, (outerR + innerR) / 2, 0, Math.PI * 2);
  ctx.strokeStyle = ringGradient(ctx, cx, cy, outerR);
  ctx.lineWidth = bandWidth;
  ctx.lineCap = "butt";
  ctx.stroke();

  // Subtle highlight on band
  ctx.beginPath();
  ctx.arc(cx, cy, (outerR + innerR) / 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = bandWidth * 0.35;
  ctx.stroke();

  // Photo / silhouette
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (opts.photo) {
    const img = opts.photo;
    const zoom = clamp(opts.photoZoom, 0.6, 3.5);
    const base = Math.max(img.width, img.height);
    const side = base / zoom;
    const ox = opts.photoOffsetX * photoR * 0.9;
    const oy = opts.photoOffsetY * photoR * 0.9;
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
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

  // Inner edge
  ctx.beginPath();
  ctx.arc(cx, cy, photoR + 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Cubicle mode: slight square notch / professional plate under text area
  if (opts.cubicle) {
    ctx.save();
    ctx.strokeStyle = "rgba(10,10,10,0.85)";
    ctx.lineWidth = 10;
    const r = outerR + blackRim + 8;
    const rad = r * 0.12;
    ctx.beginPath();
    // rounded square frame
    const x = cx - r;
    const y = cy - r;
    const w = r * 2;
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + w, rad);
    ctx.arcTo(x + w, y + w, x, y + w, rad);
    ctx.arcTo(x, y + w, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Text on the band (lower-left arc like the reference)
  const fontSize = Math.round(bandWidth * 0.72);
  const radial =
    (outerR + innerR) / 2 + opts.textCenterOffset * (bandWidth * 0.28);
  // Reference sits text along bottom-left → bottom-right; center ~ 150° in canvas
  // (canvas 0 = east, clockwise positive... standard math: 0 east, CCW)
  // Lower arc center ≈ Math.PI / 2 (south) slightly toward west: ~ 2.0 rad
  const baseCenter = Math.PI * 0.72; // ~130° — lower-left bias like screenshot
  const centerAngle = baseCenter + (opts.textOffsetDeg * Math.PI) / 180;

  drawArcText(ctx, {
    text: opts.text,
    cx,
    cy,
    radius: radial,
    centerAngle,
    color: "#ffffff",
    fontSize,
    outward: false,
  });
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
    if (o != null && o !== "") out.textOffset = Number(o);
    const c = q.get("center");
    if (c != null && c !== "") out.textCenter = Number(c);
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
  const [photoZoom, setPhotoZoom] = useState(1.15);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    const d = readHash();
    if (d.text) setText(d.text);
    if (typeof d.textOffset === "number" && !Number.isNaN(d.textOffset)) {
      setTextOffset(d.textOffset);
    }
    if (typeof d.textCenter === "number" && !Number.isNaN(d.textCenter)) {
      setTextCenter(clamp(d.textCenter, -1, 1));
    }
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
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setShareMsg("Use an image file (JPG/PNG).");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setPhotoZoom(1.15);
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
    const dx = ((e.clientX - d.x) * scale) / (SIZE * 0.4);
    const dy = ((e.clientY - d.y) * scale) / (SIZE * 0.4);
    setPhotoOffsetX(clamp(d.ox + dx, -1.2, 1.2));
    setPhotoOffsetY(clamp(d.oy + dy, -1.2, 1.2));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (!photo) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.94 : 1.06;
    setPhotoZoom((z) => clamp(z * factor, 0.6, 3.5));
  };

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    redraw();
    const a = document.createElement("a");
    a.download = `sol-new-frame-${Date.now()}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  };

  const shareLink = async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : "https://sol.new/frame";
    try {
      if (navigator.share) {
        await navigator.share({
          title: "My sol.new LinkedIn frame",
          url,
        });
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
    setPhotoZoom(1.15);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setPhoto(null);
    setShareMsg(null);
  };

  return (
    <div className="space-y-5">
      {/* Controls matching reference */}
      <div className="space-y-4 rounded-2xl border border-black/8 bg-white px-4 py-4 dark:border-white/10 dark:bg-zinc-950">
        <label className="flex items-center justify-between gap-4 text-sm font-medium text-gray-800 dark:text-white/90">
          <span>Text Offset</span>
          <input
            type="range"
            min={-180}
            max={180}
            value={textOffset}
            onChange={(e) => setTextOffset(Number(e.target.value))}
            className="h-2 w-[55%] max-w-[220px] cursor-pointer appearance-none rounded-full bg-gradient-to-r from-blue-200 to-blue-600 accent-blue-600"
          />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm font-medium text-gray-800 dark:text-white/90">
          <span>Text Center offset</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={Math.round(textCenter * 100)}
            onChange={(e) => setTextCenter(Number(e.target.value) / 100)}
            className="h-2 w-[55%] max-w-[220px] cursor-pointer appearance-none rounded-full bg-gradient-to-r from-blue-200 to-blue-600 accent-blue-600"
          />
        </label>
        <div className="flex items-center justify-between gap-4 text-sm font-medium text-gray-800 dark:text-white/90">
          <span>Cubicle</span>
          <button
            type="button"
            role="switch"
            aria-checked={cubicle}
            onClick={() => setCubicle((v) => !v)}
            className={`relative h-8 w-14 rounded-full transition ${
              cubicle ? "bg-emerald-500" : "bg-gray-200 dark:bg-white/15"
            }`}
          >
            <span
              className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[10px] font-bold shadow transition ${
                cubicle ? "left-7 text-emerald-700" : "left-1 text-rose-500"
              }`}
            >
              {cubicle ? "YES" : "NO"}
            </span>
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={`relative w-full max-w-[340px] touch-none select-none ${
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
            className="block h-auto w-full"
            aria-label="LinkedIn frame preview"
          />
        </div>
        <p className="flex items-center gap-1.5 text-center text-xs text-gray-500 dark:text-white/45">
          <span aria-hidden>✊</span>
          Drag the image to position it.
          <br />
          Use scroll / pinch to resize.
        </p>
      </div>

      {/* Text + photo */}
      <div className="space-y-2">
        <label htmlFor="frame-text" className="text-sm font-medium">
          Ring text
        </label>
        <input
          id="frame-text"
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-base font-semibold tracking-wide outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/15 dark:bg-black"
          placeholder="#OPENTOSOLANA"
          maxLength={40}
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-3 text-sm font-medium hover:bg-black/[0.05] dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <ImagePlus size={18} />
        {photo ? "Change photo" : "Upload profile photo"}
      </button>

      {/* Primary actions — blue like reference */}
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={download}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0A66C2] px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[#004182] active:scale-[0.99]"
        >
          <Download size={20} />
          Download
        </button>
        <button
          type="button"
          onClick={shareLink}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0A66C2] px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[#004182] active:scale-[0.99]"
        >
          <Share2 size={20} />
          Share Frame
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-black/10 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-black/5 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
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

      <p className="text-center text-[11px] text-gray-400 dark:text-white/35">
        Private · runs in your browser · PNG for LinkedIn profile photo
      </p>
    </div>
  );
}
