"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, ImagePlus, Link2, RotateCcw, Share2 } from "lucide-react";

const SIZE = 800;
const DEFAULT_TEXT = "#OPENTOSOLANA";
const PRESETS = [
  { label: "#OPENTOSOLANA", text: "#OPENTOSOLANA", color: "#9945FF", ring: "#14F195" },
  { label: "#OPENTOWORK", text: "#OPENTOWORK", color: "#0A66C2", ring: "#0A66C2" },
  { label: "Hiring", text: "HIRING · REACH OUT · ", color: "#F59E0B", ring: "#111827" },
  { label: "Solana", text: "SOLANA · BUILD · SHIP · ", color: "#14F195", ring: "#9945FF" },
] as const;

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

/** Draw text repeated along a circle (outside the photo ring). */
function drawCircularText(
  ctx: CanvasRenderingContext2D,
  opts: {
    text: string;
    cx: number;
    cy: number;
    radius: number;
    color: string;
    fontSize: number;
    fontFamily: string;
    clockwise?: boolean;
  }
) {
  const raw = (opts.text || " ").trim() || " ";
  // Space-pad so repeats don't glue together
  const unit = raw.endsWith(" ") ? raw : `${raw} · `;
  ctx.save();
  ctx.fillStyle = opts.color;
  ctx.font = `700 ${opts.fontSize}px ${opts.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // Measure how many copies fit the circumference
  const circ = 2 * Math.PI * opts.radius;
  const unitW = Math.max(ctx.measureText(unit).width, 1);
  const copies = Math.max(1, Math.ceil(circ / unitW));
  const full = unit.repeat(copies);
  const totalW = ctx.measureText(full).width;
  // Center the string around the circle
  let angle = -Math.PI / 2 - (totalW / opts.radius) / 2;
  const dir = opts.clockwise === false ? -1 : 1;

  for (const ch of full) {
    const w = ctx.measureText(ch).width;
    const step = w / opts.radius;
    const mid = angle + (dir * step) / 2;
    ctx.save();
    ctx.translate(opts.cx + Math.cos(mid) * opts.radius, opts.cy + Math.sin(mid) * opts.radius);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += dir * step;
  }
  ctx.restore();
}

function drawFrame(
  canvas: HTMLCanvasElement,
  opts: {
    photo: HTMLImageElement | null;
    text: string;
    textColor: string;
    ringColor: string;
    bgColor: string;
    fontSize: number;
    ringWidth: number;
    photoZoom: number;
  }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = SIZE;
  canvas.width = s;
  canvas.height = s;
  const cx = s / 2;
  const cy = s / 2;

  // Transparent outside for LinkedIn; fill optional bg behind ring only if set
  ctx.clearRect(0, 0, s, s);

  const outerR = s / 2 - 8;
  const textR = outerR - opts.fontSize * 0.55;
  const ringOuter = textR - opts.fontSize * 0.55;
  const ringInner = ringOuter - opts.ringWidth;
  const photoR = Math.max(40, ringInner - 4);

  // Soft outer glow disk
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = opts.bgColor;
  ctx.fill();

  // Photo clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (opts.photo) {
    const img = opts.photo;
    const zoom = clamp(opts.photoZoom, 1, 3);
    const side = Math.min(img.width, img.height) / zoom;
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, cx - photoR, cy - photoR, photoR * 2, photoR * 2);
  } else {
    // Placeholder gradient
    const g = ctx.createLinearGradient(cx - photoR, cy - photoR, cx + photoR, cy + photoR);
    g.addColorStop(0, "#9945FF");
    g.addColorStop(1, "#14F195");
    ctx.fillStyle = g;
    ctx.fillRect(cx - photoR, cy - photoR, photoR * 2, photoR * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `600 ${Math.round(photoR * 0.18)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Your photo", cx, cy);
  }
  ctx.restore();

  // Ring (between photo and text)
  ctx.beginPath();
  ctx.arc(cx, cy, (ringOuter + ringInner) / 2, 0, Math.PI * 2);
  ctx.strokeStyle = opts.ringColor;
  ctx.lineWidth = opts.ringWidth;
  ctx.stroke();

  // Optional thin inner edge
  ctx.beginPath();
  ctx.arc(cx, cy, photoR + 1, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  drawCircularText(ctx, {
    text: opts.text,
    cx,
    cy,
    radius: textR,
    color: opts.textColor,
    fontSize: opts.fontSize,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    clockwise: true,
  });
}

function readHashDefaults(): Partial<{
  text: string;
  textColor: string;
  ringColor: string;
  bgColor: string;
}> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return {};
    // support #text=%23OPENTOSOLANA and #text=...&color=...
    const q = new URLSearchParams(raw.includes("=") ? raw : `text=${raw}`);
    const out: Record<string, string> = {};
    const t = q.get("text");
    if (t) out.text = t;
    const c = q.get("color") || q.get("textColor");
    if (c) out.textColor = c.startsWith("#") ? c : `#${c}`;
    const r = q.get("ring") || q.get("ringColor");
    if (r) out.ringColor = r.startsWith("#") ? r : `#${r}`;
    const b = q.get("bg");
    if (b) out.bgColor = b.startsWith("#") ? b : `#${b}`;
    return out;
  } catch {
    return {};
  }
}

export function FrameStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [textColor, setTextColor] = useState("#9945FF");
  const [ringColor, setRingColor] = useState("#14F195");
  const [bgColor, setBgColor] = useState("#0a0a0a");
  const [fontSize, setFontSize] = useState(42);
  const [ringWidth, setRingWidth] = useState(18);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  // hydrate from hash once
  useEffect(() => {
    const d = readHashDefaults();
    if (d.text) setText(d.text);
    if (d.textColor) setTextColor(d.textColor);
    if (d.ringColor) setRingColor(d.ringColor);
    if (d.bgColor) setBgColor(d.bgColor);
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
      textColor,
      ringColor,
      bgColor,
      fontSize,
      ringWidth,
      photoZoom,
    });
  }, [photo, text, textColor, ringColor, bgColor, fontSize, ringWidth, photoZoom]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // sync shareable hash (no navigation)
  useEffect(() => {
    const q = new URLSearchParams();
    q.set("text", text);
    q.set("color", textColor);
    q.set("ring", ringColor);
    q.set("bg", bgColor);
    const next = `#${q.toString()}`;
    if (typeof window !== "undefined" && window.location.hash !== next) {
      history.replaceState(null, "", `${window.location.pathname}${next}`);
    }
  }, [text, textColor, ringColor, bgColor]);

  const onFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setShareMsg("Use an image file (JPG/PNG).");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    setShareMsg(null);
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
    const url = typeof window !== "undefined" ? window.location.href : "https://sol.new/frame";
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied.");
    } catch {
      setShareMsg(url);
    }
  };

  const reset = () => {
    setText(DEFAULT_TEXT);
    setTextColor("#9945FF");
    setRingColor("#14F195");
    setBgColor("#0a0a0a");
    setFontSize(42);
    setRingWidth(18);
    setPhotoZoom(1);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setPhoto(null);
    setShareMsg(null);
  };

  const previewStyle = useMemo(
    () => ({ maxWidth: "min(100%, 360px)" as const }),
    []
  );

  return (
    <div className="space-y-6">
      {/* Canvas preview */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="relative w-full overflow-hidden rounded-full shadow-xl ring-1 ring-black/10 dark:ring-white/10"
          style={previewStyle}
        >
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="block h-auto w-full"
            aria-label="Profile frame preview"
          />
        </div>
        <p className="text-center text-xs text-gray-500 dark:text-white/45">
          800×800 PNG · use as LinkedIn profile photo
        </p>
      </div>

      {/* Upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Photo</label>
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-black/[0.03] px-4 py-3 text-sm font-medium hover:bg-black/[0.06] dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <ImagePlus size={18} />
          {photo ? "Change photo" : "Upload profile photo"}
        </button>
        {photo && (
          <label className="block text-xs text-gray-500 dark:text-white/50">
            Zoom
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.01}
              value={photoZoom}
              onChange={(e) => setPhotoZoom(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        )}
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setText(p.text);
                setTextColor(p.color);
                setRingColor(p.ring);
              }}
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text */}
      <div className="space-y-2">
        <label htmlFor="frame-text" className="text-sm font-medium">
          Ring text
        </label>
        <input
          id="frame-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-fuchsia-500/40 dark:border-white/15 dark:bg-black"
          placeholder="#OPENTOSOLANA"
          maxLength={80}
        />
        <label className="block text-xs text-gray-500 dark:text-white/50">
          Text size
          <input
            type="range"
            min={24}
            max={64}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-3 gap-3">
        <label className="space-y-1 text-xs font-medium">
          Text
          <input
            type="color"
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-black/10 bg-transparent dark:border-white/15"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Ring
          <input
            type="color"
            value={ringColor}
            onChange={(e) => setRingColor(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-black/10 bg-transparent dark:border-white/15"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Background
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-black/10 bg-transparent dark:border-white/15"
          />
        </label>
      </div>

      <label className="block text-xs text-gray-500 dark:text-white/50">
        Ring thickness
        <input
          type="range"
          min={6}
          max={40}
          value={ringWidth}
          onChange={(e) => setRingWidth(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={download}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500 active:scale-[0.99]"
        >
          <Download size={18} />
          Download PNG
        </button>
        <button
          type="button"
          onClick={shareLink}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          <Share2 size={18} />
          Copy link
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10 sm:flex-none"
          aria-label="Reset"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {shareMsg && (
        <p className="flex items-start gap-2 break-all text-xs text-gray-600 dark:text-white/60">
          <Link2 size={14} className="mt-0.5 shrink-0" />
          {shareMsg}
        </p>
      )}

      <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-500 dark:text-white/45">
        <li>Upload a clear headshot (square crop works best).</li>
        <li>Set ring text — default is #OPENTOSOLANA.</li>
        <li>Download PNG → LinkedIn → Profile photo.</li>
      </ol>
    </div>
  );
}
