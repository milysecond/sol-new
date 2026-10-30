"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import {
  Download,
  Share2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Move,
} from "lucide-react";

type TemplateBox = {
  id: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style?: string;
  align?: "left" | "center" | "right";
};

type Template = {
  id: string;
  name: string;
  blank: string;
  blankRaw?: string;
  face?: string;
  tag?: string;
  lines?: number;
  boxes?: TemplateBox[];
  featured?: boolean;
  keywords?: string[];
  /** Position in API list — used for "new first" sort */
  catalogIndex?: number;
};

type FaceFilter = "all" | "toly" | "original";
type SortMode = "new" | "random" | "featured";

const MEMES_API = "https://memes.sol.new";
const WATERMARK = "sol.new";
const PAGE_SIZE = 18;

function shuffleInPlace<T>(arr: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function proxiedBlank(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/memes/blank")) return url;
  try {
    const u = new URL(url, MEMES_API);
    if (u.hostname.endsWith("memes.sol.new") || u.pathname.startsWith("/templates/")) {
      return `/api/memes/blank?url=${encodeURIComponent(u.toString())}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

function normalizeTemplate(raw: any): Template {
  const blankRaw = raw.blank || raw.blankRaw || raw.image || "";
  return {
    id: String(raw.id || ""),
    name: String(raw.name || raw.id || "Template"),
    blank: proxiedBlank(blankRaw),
    blankRaw: blankRaw || undefined,
    face: raw.face ? String(raw.face).toLowerCase() : undefined,
    tag: raw.tag,
    lines: raw.lines,
    boxes: raw.boxes,
    featured: !!raw.featured,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
  };
}

function defaultBoxes(n: number): TemplateBox[] {
  if (n <= 1) {
    return [{ id: "mid", x: 0.05, y: 0.4, w: 0.9, h: 0.16, align: "center" as const }];
  }
  const extras: TemplateBox[] = Array.from({ length: Math.max(0, n - 2) }, (_, i) => ({
    id: `l${i + 2}`,
    x: 0.05,
    y: 0.35 + i * 0.15,
    w: 0.9,
    h: 0.14,
    align: "center" as const,
  }));
  const base: TemplateBox[] = [
    { id: "top", x: 0.04, y: 0.03, w: 0.92, h: 0.16, align: "center" },
    { id: "bottom", x: 0.04, y: 0.78, w: 0.92, h: 0.16, align: "center" },
    ...extras,
  ];
  return base.slice(0, n);
}

function cloneBoxes(tpl: Template): TemplateBox[] {
  const n = tpl.boxes?.length || tpl.lines || 2;
  if (tpl.boxes?.length) {
    return tpl.boxes.map((b, i) => ({
      id: b.id || `box-${i}`,
      label: b.label,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      style: b.style,
      align: b.align || "center",
    }));
  }
  return defaultBoxes(n);
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pad = Math.max(10, Math.floor(w * 0.02));
  const fontSize = Math.max(14, Math.floor(w * 0.035));
  ctx.save();
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const x = w - pad;
  const y = h - pad;
  const metrics = ctx.measureText(WATERMARK);
  const tw = metrics.width + pad * 0.9;
  const th = fontSize + pad * 0.55;
  const rx = x - tw;
  const ry = y - th;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  const r = Math.min(10, th / 2);
  ctx.beginPath();
  ctx.moveTo(rx + r, ry);
  ctx.arcTo(rx + tw, ry, rx + tw, ry + th, r);
  ctx.arcTo(rx + tw, ry + th, rx, ry + th, r);
  ctx.arcTo(rx, ry + th, rx, ry, r);
  ctx.arcTo(rx, ry, rx + tw, ry, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(WATERMARK, x - pad * 0.35, y - pad * 0.2);
  ctx.restore();
}

export default function MemesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [captions, setCaptions] = useState<string[]>(["", ""]);
  /** Editable text box layout (normalized 0–1) — draggable on canvas */
  const [boxes, setBoxes] = useState<TemplateBox[]>([]);
  const [filter, setFilter] = useState<FaceFilter>("toly");
  const [sort, setSort] = useState<SortMode>("new");
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [activeBox, setActiveBox] = useState<number | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  /** When a meme is selected, hide the grid until user taps Change blank */
  const [picking, setPicking] = useState(true);
  const [draggingText, setDraggingText] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const dragRef = useRef<{
    index: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${MEMES_API}/api/templates?limit=300`);
        const data = (await res.json()) as { items?: any[] };
        const items: Template[] = (data.items || []).map(normalizeTemplate);

        const cleaned = items
          .map((tpl, idx) => ({ ...tpl, catalogIndex: idx }))
          .filter((t) => {
          const f = (t.face || "").toLowerCase();
          if (f === "sal" || f === "ansem") return false;
          const id = t.id.toLowerCase();
          if (id.includes("ansem") || id.startsWith("sal-") || id.includes("-sal-")) return false;
          return true;
        });

        setTemplates(cleaned);
        // Desktop: start on full blank grid (don't auto-open editor)
        setSelected(null);
        setPicking(true);
      } catch {
        const fallback: Template = {
          id: "toly-screaming",
          name: "Toly Screaming",
          blank: proxiedBlank(`${MEMES_API}/templates/toly-screaming.jpg`),
          blankRaw: `${MEMES_API}/templates/toly-screaming.jpg`,
          face: "toly",
          boxes: defaultBoxes(2),
        };
        setTemplates([fallback]);
        applyTemplate(fallback);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTemplate = (tpl: Template) => {
    setSelected(tpl);
    const b = cloneBoxes(tpl);
    setBoxes(b);
    setCaptions(
      Array(b.length)
        .fill("")
        .map((_, i) => (i === 0 ? "ME" : "WHEN I SEE THE CHART")),
    );
    setActiveBox(null);
    setImgSize(null);
    setPicking(false);
  };

  const counts = useMemo(() => {
    let toly = 0;
    let original = 0;
    for (const t of templates) {
      if (t.face === "toly" || t.id.toLowerCase().includes("toly")) toly += 1;
      else original += 1;
    }
    return { all: templates.length, toly, original };
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = templates.filter((t) => {
      const id = t.id.toLowerCase();
      const isToly = t.face === "toly" || id.includes("toly");
      if (filter === "toly" && !isToly) return false;
      if (filter === "original" && isToly) return false;
      if (!q) return true;
      const hay = [t.id, t.name, t.face, t.tag, ...(t.keywords || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    if (sort === "new") {
      list = [...list].sort((a, b) => (b.catalogIndex ?? 0) - (a.catalogIndex ?? 0));
    } else if (sort === "featured") {
      list = [...list].sort((a, b) => {
        const score = (t: Template) =>
          (t.featured ? 8 : 0) + (t.face === "toly" ? 2 : 0) + (t.id.includes("screaming") ? 1 : 0);
        return score(b) - score(a) || (b.catalogIndex ?? 0) - (a.catalogIndex ?? 0);
      });
    } else {
      list = shuffleInPlace([...list], shuffleSeed);
    }
    return list;
  }, [templates, filter, query, sort, shuffleSeed]);

  const pageCount = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filteredTemplates.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filter, query, sort, shuffleSeed]);

  const renderToCanvas = useCallback(
    async (tpl: Template, caps: string[], layout: TemplateBox[], opts?: { guides?: boolean }) => {
      const canvas = canvasRef.current;
      if (!canvas || !tpl) return;

      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return;

      let img = imgCache.current.get(tpl.blank);
      if (!img) {
        img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img!.onload = () => resolve();
          img!.onerror = () => reject(new Error("failed to load blank"));
          img!.src = tpl.blank;
        });
        imgCache.current.set(tpl.blank, img);
      }

      const w = img.naturalWidth || img.width || 800;
      const h = img.naturalHeight || img.height || 800;
      setImgSize({ w, h });
      canvas.width = w;
      canvas.height = h;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const useBoxes = layout.length
        ? layout
        : defaultBoxes(caps.length || 2);

      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";

      useBoxes.forEach((box, i) => {
        const text = caps[i] || "";
        const px = box.x * w;
        const py = box.y * h;
        const bw = box.w * w;
        const bh = box.h * h;

        if (opts?.guides || activeBox === i) {
          ctx.save();
          ctx.strokeStyle = activeBox === i ? "rgba(236,72,153,0.9)" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = Math.max(2, w * 0.003);
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(px, py, bw, bh);
          ctx.restore();
        }

        if (!text) return;

        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = Math.max(4, Math.floor(w * 0.008));

        let fontSize = Math.floor(bh * 0.85);
        ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;

        const lines = text.toUpperCase().split("\n").slice(0, 2);
        const lineHeight = fontSize * 1.05;

        lines.forEach((line, li) => {
          const y = py + bh / 2 + (li - (lines.length - 1) / 2) * lineHeight;
          const maxWidth = bw * 0.94;
          let size = fontSize;
          while (size > 16 && ctx.measureText(line).width > maxWidth) {
            size -= 2;
            ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
          }
          ctx.textAlign = box.align || "center";
          const x =
            box.align === "left" ? px + bw * 0.03 : box.align === "right" ? px + bw * 0.97 : px + bw / 2;
          ctx.strokeText(line, x, y);
          ctx.fillText(line, x, y);
        });
      });

      drawWatermark(ctx, w, h);
    },
    [activeBox],
  );

  useEffect(() => {
    if (selected) {
      renderToCanvas(selected, captions, boxes, { guides: activeBox != null }).catch(() => {});
    }
  }, [selected, captions, boxes, activeBox, renderToCanvas]);

  // Prevent page scroll while dragging caption boxes (esp. mobile)
  useEffect(() => {
    if (!draggingText) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    const block = (ev: Event) => {
      ev.preventDefault();
    };
    // non-passive so preventDefault works
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("wheel", block, { passive: false });
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      window.removeEventListener("touchmove", block);
      window.removeEventListener("wheel", block);
    };
  }, [draggingText]);

  /** Map pointer → canvas pixel coords accounting for CSS scaling */
  const canvasPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
      cw: canvas.width,
      ch: canvas.height,
    };
  };

  const hitTestBox = (px: number, py: number, cw: number, ch: number): number => {
    // Topmost last boxes first
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      const x0 = b.x * cw;
      const y0 = b.y * ch;
      const x1 = x0 + b.w * cw;
      const y1 = y0 + b.h * ch;
      // generous hit padding
      const pad = Math.max(12, cw * 0.015);
      if (px >= x0 - pad && px <= x1 + pad && py >= y0 - pad && py <= y1 + pad) return i;
    }
    return -1;
  };

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pt = canvasPoint(e);
    if (!pt) return;
    const idx = hitTestBox(pt.x, pt.y, pt.cw, pt.ch);
    if (idx < 0) {
      setActiveBox(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActiveBox(idx);
    setDraggingText(true);
    dragRef.current = {
      index: idx,
      startX: pt.x,
      startY: pt.y,
      origX: boxes[idx].x,
      origY: boxes[idx].y,
    };
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const pt = canvasPoint(e);
    if (!drag || !pt) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = (pt.x - drag.startX) / pt.cw;
    const dy = (pt.y - drag.startY) / pt.ch;
    const b = boxes[drag.index];
    if (!b) return;
    // Allow text boxes to hang off / leave the image edges
    // Soft limit so they stay roughly reachable (~full box width/height off)
    const nx = Math.min(Math.max(-b.w * 0.95, drag.origX + dx), 0.95);
    const ny = Math.min(Math.max(-b.h * 0.95, drag.origY + dy), 0.95);
    setBoxes((prev) =>
      prev.map((box, i) => (i === drag.index ? { ...box, x: nx, y: ny } : box)),
    );
  };

  const onCanvasPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      e.preventDefault();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null;
    setDraggingText(false);
  };

  const updateCaption = (index: number, value: string) => {
    setCaptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const resetLayout = () => {
    if (!selected) return;
    const b = cloneBoxes(selected);
    setBoxes(b);
    setCaptions(
      Array(b.length)
        .fill("")
        .map((_, i) => (i === 0 ? "ME" : "SOL GOES BRRR")),
    );
    setActiveBox(null);
  };

  const download = async () => {
    if (!selected || !canvasRef.current) return;
    setGenerating(true);
    try {
      // Render without guides for clean export
      await renderToCanvas(selected, captions, boxes, { guides: false });
      const link = document.createElement("a");
      link.download = `${selected.id || "meme"}-solnew.png`;
      link.href = canvasRef.current.toDataURL("image/png");
      link.click();
      // restore guides if a box was active
      await renderToCanvas(selected, captions, boxes, { guides: activeBox != null });
    } finally {
      setTimeout(() => setGenerating(false), 200);
    }
  };

  const share = async () => {
    if (!selected || !canvasRef.current) return;
    await renderToCanvas(selected, captions, boxes, { guides: false });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvasRef.current!.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const file = new File([blob], `${selected.id || "meme"}-solnew.png`, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "sol.new meme",
          text: captions.filter(Boolean).join(" / "),
        });
        return;
      } catch {
        /* cancelled */
      }
    }
    const text = encodeURIComponent(
      `${captions.filter(Boolean).join(" ")} via @solnew https://sol.new/memes`,
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
    await renderToCanvas(selected, captions, boxes, { guides: activeBox != null });
  };

  const chips: { id: FaceFilter; label: string; count: number }[] = [
    { id: "toly", label: "Toly", count: counts.toly },
    { id: "original", label: "Original", count: counts.original },
    { id: "all", label: "All", count: counts.all },
  ];

  const aspectStyle =
    imgSize && imgSize.w > 0 && imgSize.h > 0
      ? { aspectRatio: `${imgSize.w} / ${imgSize.h}` }
      : { aspectRatio: "1 / 1" };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <div className="app-shell-wide py-5 sm:py-8 lg:py-10 space-y-6 lg:space-y-8">
          <div className="text-center space-y-3">
            <div className="text-xs uppercase tracking-[3px] text-pink-500 dark:text-pink-400 font-semibold">
              sol.new · memes
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Memes</h1>
            <p className="text-gray-500 dark:text-white/50 max-w-md mx-auto">
              Drag captions on the image. Filter, paginate, download with sol.new watermark.
            </p>
          </div>

          {/* Filters + sort + search */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap justify-center lg:justify-start gap-2 text-sm">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFilter(c.id)}
                    className={`px-3 py-1 rounded-lg border transition ${
                      filter === c.id
                        ? "bg-pink-500 text-black border-pink-400"
                        : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/70"
                    }`}
                  >
                    {c.label}
                    <span
                      className={`ml-1.5 text-[11px] ${filter === c.id ? "text-black/60" : "text-gray-400"}`}
                    >
                      {c.count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center lg:justify-end gap-2 text-sm">
                {(
                  [
                    { id: "new" as const, label: "New" },
                    { id: "random" as const, label: "Random" },
                    { id: "featured" as const, label: "Featured" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (s.id === "random") setShuffleSeed(Date.now());
                      setSort(s.id);
                    }}
                    className={`px-3 py-1 rounded-lg border transition ${
                      sort === s.id
                        ? "bg-violet-500 text-white border-violet-400"
                        : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/70"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="relative w-full max-w-xl mx-auto lg:mx-0 lg:max-w-md lg:ml-auto">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates…"
                className="w-full rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/5 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-pink-500/60"
              />
            </label>
          </div>

          <div className={`grid gap-6 ${selected && !picking ? "" : ""}`}>
            {/* Templates — full-width grid on desktop until a blank is chosen */}
            {(picking || !selected) && (
            <div className={`${selected && !picking ? "" : "w-full"} flex flex-col min-h-0`}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/50">
                  Choose blank
                </div>
                <div className="text-[11px] text-gray-400">
                  {loading
                    ? "…"
                    : `${filteredTemplates.length} · page ${safePage + 1}/${pageCount} · ${sort}`}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-3 text-gray-500 dark:text-white/60 py-8">
                  <Spinner /> Loading templates…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 lg:gap-4">
                    {pageItems.length === 0 && (
                      <div className="col-span-full text-gray-500 dark:text-white/50 text-sm py-8 text-center">
                        No templates match this filter.
                      </div>
                    )}
                    {pageItems.map((tpl) => {
                      const isActive = selected?.id === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => applyTemplate(tpl)}
                          className={`group relative rounded-2xl overflow-hidden border bg-zinc-100 dark:bg-zinc-900 text-left transition ${
                            isActive
                              ? "border-pink-500 dark:border-pink-400 ring-1 ring-pink-500/20"
                              : "border-black/10 dark:border-white/10 hover:border-pink-400/40"
                          }`}
                        >
                          {/* Natural aspect — no forced square crop */}
                          <div className="relative w-full bg-black/5 dark:bg-white/5">
                            <img
                              src={tpl.blank}
                              alt={tpl.name}
                              className="w-full h-auto max-h-40 object-contain mx-auto block"
                              loading="lazy"
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const el = e.currentTarget;
                                if (tpl.blankRaw && !el.dataset.fallback) {
                                  el.dataset.fallback = "1";
                                  el.removeAttribute("crossorigin");
                                  el.src = tpl.blankRaw;
                                }
                              }}
                            />
                          </div>
                          <div className="p-2 text-[11px] sm:text-xs font-semibold leading-snug line-clamp-2 min-h-[2.5rem]">
                            {tpl.name}
                            {tpl.face && (
                              <span className="ml-1 text-[10px] font-normal text-gray-400">
                                · {tpl.face}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {pageCount > 1 && (
                    <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-black/5 dark:border-white/10">
                      <button
                        type="button"
                        disabled={safePage <= 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className="inline-flex items-center gap-1 rounded-xl border border-black/10 dark:border-white/15 px-3 py-2 text-sm disabled:opacity-40 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <ChevronLeft size={16} /> Prev
                      </button>
                      <div className="flex items-center gap-1.5 flex-wrap justify-center">
                        {Array.from({ length: pageCount }, (_, i) => i)
                          .filter((i) => {
                            // window of pages around current
                            if (pageCount <= 7) return true;
                            return (
                              i === 0 ||
                              i === pageCount - 1 ||
                              Math.abs(i - safePage) <= 1
                            );
                          })
                          .reduce<(number | "…")[]>((acc, i, idx, arr) => {
                            if (idx > 0) {
                              const prev = arr[idx - 1];
                              if (typeof prev === "number" && i - prev > 1) acc.push("…");
                            }
                            acc.push(i);
                            return acc;
                          }, [])
                          .map((item, idx) =>
                            item === "…" ? (
                              <span key={`e${idx}`} className="px-1 text-gray-400 text-xs">
                                …
                              </span>
                            ) : (
                              <button
                                key={item}
                                type="button"
                                onClick={() => setPage(item)}
                                className={`min-w-8 h-8 rounded-lg text-xs font-medium ${
                                  item === safePage
                                    ? "bg-pink-500 text-black"
                                    : "hover:bg-black/5 dark:hover:bg-white/10 text-gray-600 dark:text-white/70"
                                }`}
                              >
                                {item + 1}
                              </button>
                            ),
                          )}
                      </div>
                      <button
                        type="button"
                        disabled={safePage >= pageCount - 1}
                        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                        className="inline-flex items-center gap-1 rounded-xl border border-black/10 dark:border-white/15 px-3 py-2 text-sm disabled:opacity-40 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        Next <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            )}

            {/* Editor — only when a meme is selected and not browsing blanks */}
            {selected && !picking && (
            <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{selected.name}</div>
                      {selected.face && (
                        <div className="text-[11px] text-gray-400 capitalize">{selected.face}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPicking(true)}
                      className="shrink-0 rounded-xl border border-black/10 dark:border-white/15 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      Change blank
                    </button>
                  </div>
                  <div
                    ref={canvasWrapRef}
                    className="relative rounded-3xl overflow-hidden border border-black/10 dark:border-white/10 bg-zinc-950 flex items-center justify-center max-h-[min(78vh,720px)] lg:max-h-[min(82vh,800px)] overscroll-none select-none"
                    style={{ ...aspectStyle, touchAction: "none" }}
                    onTouchMove={(e) => {
                      if (draggingText) e.preventDefault();
                    }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="max-h-[min(78vh,720px)] lg:max-h-[min(82vh,800px)] max-w-full w-auto h-auto object-contain cursor-grab active:cursor-grabbing touch-none select-none"
                      style={{ touchAction: "none" }}
                      onPointerDown={onCanvasPointerDown}
                      onPointerMove={onCanvasPointerMove}
                      onPointerUp={onCanvasPointerUp}
                      onPointerCancel={onCanvasPointerUp}
                    />
                  </div>

                  <p className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/40 px-1">
                    <Move size={12} /> Drag caption boxes on the image to reposition text
                    {activeBox != null && (
                      <span className="text-pink-400">· editing box {activeBox + 1}</span>
                    )}
                  </p>

                  <div className="grid gap-3">
                    {captions.map((cap, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveBox(i)}
                          className={`w-14 shrink-0 text-[10px] uppercase tracking-widest pt-1 text-left ${
                            activeBox === i ? "text-pink-500" : "text-gray-400"
                          }`}
                          title="Select box to highlight on canvas"
                        >
                          {boxes[i]?.label || (i === 0 ? "TOP" : i === captions.length - 1 ? "BOT" : `L${i + 1}`)}
                        </button>
                        <input
                          value={cap}
                          onChange={(e) => updateCaption(i, e.target.value)}
                          onFocus={() => setActiveBox(i)}
                          placeholder={i === 0 ? "TOP TEXT" : "BOTTOM TEXT"}
                          className="flex-1 bg-zinc-950 border border-black/10 dark:border-white/10 focus:border-pink-500/60 rounded-2xl px-5 py-3 text-xl font-semibold tracking-tight placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none text-white"
                          maxLength={80}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      onClick={download}
                      disabled={generating}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 hover:bg-pink-400 text-black font-semibold px-6 py-3 transition active:scale-[0.985] disabled:opacity-60"
                    >
                      <Download size={18} /> Download PNG
                    </button>
                    <button
                      type="button"
                      onClick={share}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 dark:border-white/10 px-6 py-3 font-medium hover:bg-black/5 dark:hover:bg-white/5 transition"
                    >
                      <Share2 size={18} /> Share
                    </button>
                    <button
                      type="button"
                      onClick={resetLayout}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 dark:border-white/10 px-5 py-3 text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-white transition"
                    >
                      <RefreshCw size={16} /> Reset
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-400 dark:text-white/35 px-1">
                    Templates from{" "}
                    <a
                      href="https://memes.sol.new"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      memes.sol.new
                    </a>
                    . Exports include a{" "}
                    <span className="font-medium text-gray-500 dark:text-white/50">sol.new</span>{" "}
                    watermark. Image keeps its real aspect ratio.
                  </p>
                </div>
            </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
