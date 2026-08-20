"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { Download, Share2, RefreshCw, Search, GripVertical, X } from "lucide-react";

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
};

type FaceFilter = "all" | "toly" | "original";

const MEMES_API = "https://memes.sol.new";
const WATERMARK = "sol.new";

/** Same-origin proxy — memes.sol.new blanks have no CORS (breaks crossOrigin img/canvas). */
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
  const blank = proxiedBlank(blankRaw);
  return {
    id: String(raw.id || ""),
    name: String(raw.name || raw.id || "Template"),
    blank,
    blankRaw: blankRaw || blank,
    face: raw.face ? String(raw.face).toLowerCase() : undefined,
    tag: raw.tag,
    lines: raw.lines,
    boxes: raw.boxes,
    featured: !!raw.featured,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
  };
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
  // soft pill behind text
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
  const [filter, setFilter] = useState<FaceFilter>("toly");
  const [query, setQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  // Floating search — user can drag it around (persisted)
  const [searchPos, setSearchPos] = useState<{ x: number; y: number } | null>(null);
  const [draggingSearch, setDraggingSearch] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Fetch full catalog (filter client-side so chips stay snappy)
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${MEMES_API}/api/templates?limit=300`);
        const data = (await res.json()) as { items?: any[] };
        const items: Template[] = (data.items || []).map(normalizeTemplate);

        // Drop Sal/Ansem face swaps per product preference; keep originals + Toly
        const cleaned = items.filter((t) => {
          const f = (t.face || "").toLowerCase();
          if (f === "sal" || f === "ansem") return false;
          const id = t.id.toLowerCase();
          if (id.includes("ansem") || id.startsWith("sal-") || id.includes("-sal-")) return false;
          return true;
        });

        // Stable order: featured + toly first, then rest
        cleaned.sort((a, b) => {
          const score = (t: Template) =>
            (t.featured ? 4 : 0) + (t.face === "toly" ? 2 : 0) + (t.id.includes("screaming") ? 1 : 0);
          return score(b) - score(a) || a.name.localeCompare(b.name);
        });

        setTemplates(cleaned);

        const def =
          cleaned.find((t) => t.face === "toly" && t.featured) ||
          cleaned.find((t) => t.face === "toly") ||
          cleaned.find((t) => t.id.includes("screaming")) ||
          cleaned[0];
        if (def) {
          setSelected(def);
          const numLines = def.boxes?.length || def.lines || 2;
          setCaptions(
            Array(numLines)
              .fill("")
              .map((_, i) => (i === 0 ? "ME" : "WHEN I SEE THE CHART")),
          );
        }
      } catch {
        const fallback: Template[] = [
          {
            id: "toly-screaming",
            name: "Toly Screaming",
            blank: proxiedBlank(`${MEMES_API}/templates/toly-screaming.jpg`),
            blankRaw: `${MEMES_API}/templates/toly-screaming.jpg`,
            face: "toly",
            boxes: [
              { id: "top", x: 0.05, y: 0.03, w: 0.9, h: 0.18, style: "impact", align: "center" },
              { id: "bottom", x: 0.05, y: 0.78, w: 0.9, h: 0.18, style: "impact", align: "center" },
            ],
          },
        ];
        setTemplates(fallback);
        setSelected(fallback[0]);
        setCaptions(["ME", "WHEN SOL HITS 420"]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Restore floating search position
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sol.new.memes.searchPos");
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (typeof p.x === "number" && typeof p.y === "number") setSearchPos(p);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onSearchPointerDown = useCallback((e: ReactPointerEvent) => {
    // Only drag from grip / chrome, not the text input itself
    const target = e.target as HTMLElement;
    if (target.closest("input")) return;
    const box = searchBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDraggingSearch(true);
    box.setPointerCapture(e.pointerId);
  }, []);

  const onSearchPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingSearch) return;
      const x = Math.max(8, Math.min(window.innerWidth - 280, e.clientX - dragOffset.current.x));
      const y = Math.max(8, Math.min(window.innerHeight - 56, e.clientY - dragOffset.current.y));
      setSearchPos({ x, y });
    },
    [draggingSearch],
  );

  const onSearchPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingSearch) return;
      setDraggingSearch(false);
      try {
        searchBoxRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setSearchPos((prev) => {
        if (prev) {
          try {
            localStorage.setItem("sol.new.memes.searchPos", JSON.stringify(prev));
          } catch {
            /* ignore */
          }
        }
        return prev;
      });
    },
    [draggingSearch],
  );

  const resetSearchPos = () => {
    setSearchPos(null);
    try {
      localStorage.removeItem("sol.new.memes.searchPos");
    } catch {
      /* ignore */
    }
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
    return templates.filter((t) => {
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
  }, [templates, filter, query]);

  const renderToCanvas = async (tpl: Template, caps: string[]) => {
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

    const w = img.width || 800;
    const h = img.height || 800;
    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(img, 0, 0, w, h);

    const boxes =
      tpl.boxes && tpl.boxes.length > 0
        ? tpl.boxes
        : [
            { id: "top", x: 0.05, y: 0.04, w: 0.9, h: 0.16, align: "center" as const },
            { id: "bottom", x: 0.05, y: 0.78, w: 0.9, h: 0.16, align: "center" as const },
          ];

    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(4, Math.floor(w * 0.008));
    ctx.lineJoin = "round";

    caps.forEach((text, i) => {
      if (!text) return;
      const box = boxes[i] || boxes[boxes.length - 1];
      const px = box.x * w;
      const py = box.y * h;
      const bw = box.w * w;
      const bh = box.h * h;

      const fontSize = Math.floor(bh * 0.85);
      ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;

      const lines = text.toUpperCase().split("\n").slice(0, 2);
      const lineHeight = fontSize * 1.05;

      lines.forEach((line, li) => {
        const y = py + bh / 2 + (li - (lines.length - 1) / 2) * lineHeight;
        const maxWidth = bw * 0.94;
        let size = fontSize;
        while (size > 20 && ctx.measureText(line).width > maxWidth) {
          size -= 2;
          ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
        }
        ctx.textAlign = box.align || "center";
        const x = px + bw / 2;
        ctx.strokeText(line, x, y);
        ctx.fillText(line, x, y);
      });
    });

    // Brand watermark (export + live preview)
    drawWatermark(ctx, w, h);
  };

  useEffect(() => {
    if (selected) {
      renderToCanvas(selected, captions).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, captions]);

  const updateCaption = (index: number, value: string) => {
    setCaptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const pickTemplate = (tpl: Template) => {
    setSelected(tpl);
    const n = tpl.boxes?.length || tpl.lines || 2;
    setCaptions(
      Array(n)
        .fill("")
        .map((_, i) => (i === 0 ? "ME" : "WHEN I CHECK THE CHART")),
    );
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGenerating(true);
    const link = document.createElement("a");
    link.download = `${selected?.id || "meme"}-solnew.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setTimeout(() => setGenerating(false), 300);
  };

  const share = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const file = new File([blob], `${selected?.id || "meme"}-solnew.png`, { type: "image/png" });

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
  };

  const resetCaptions = () => {
    if (!selected) return;
    const n = selected.boxes?.length || 2;
    setCaptions(Array(n).fill("").map((_, i) => (i === 0 ? "ME" : "SOL GOES BRRR")));
  };

  const chips: { id: FaceFilter; label: string; count: number }[] = [
    { id: "toly", label: "Toly", count: counts.toly },
    { id: "original", label: "Original", count: counts.original },
    { id: "all", label: "All", count: counts.all },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 sm:py-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="text-xs uppercase tracking-[3px] text-pink-500 dark:text-pink-400 font-semibold">
              sol.new · memes
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Memes</h1>
            <p className="text-gray-500 dark:text-white/50 max-w-md mx-auto">
              Filter blanks, caption, download. Watermarked sol.new.
            </p>
          </div>

          {/* Face filters */}
          <div className="flex flex-wrap justify-center gap-2 text-sm">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                className={`px-4 py-1.5 rounded-xl border transition ${
                  filter === c.id
                    ? "bg-pink-500 text-black border-pink-400"
                    : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/70"
                }`}
              >
                {c.label}
                <span className={`ml-1.5 text-[11px] ${filter === c.id ? "text-black/60" : "text-gray-400"}`}>
                  {c.count}
                </span>
              </button>
            ))}
          </div>

          {/* Draggable floating search — drag the grip to move; position saved */}
          <div
            ref={searchBoxRef}
            onPointerDown={onSearchPointerDown}
            onPointerMove={onSearchPointerMove}
            onPointerUp={onSearchPointerUp}
            onPointerCancel={onSearchPointerUp}
            style={
              searchPos
                ? { position: "fixed", left: searchPos.x, top: searchPos.y, zIndex: 60 }
                : undefined
            }
            className={`${
              searchPos
                ? "w-[min(20rem,calc(100vw-1rem))]"
                : "relative mx-auto w-full max-w-md"
            } flex items-center gap-1 rounded-2xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-lg shadow-black/10 px-1.5 py-1.5 ${
              draggingSearch ? "cursor-grabbing ring-2 ring-pink-500/40" : ""
            }`}
          >
            <button
              type="button"
              aria-label="Drag search"
              title="Drag to move search"
              className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical size={16} />
            </button>
            <div className="relative flex-1 min-w-0">
              <Search
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates…"
                className="w-full rounded-xl bg-black/[0.03] dark:bg-white/5 pl-9 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-pink-500/50 border-0"
              />
            </div>
            {(query || searchPos) && (
              <button
                type="button"
                aria-label={query ? "Clear search" : "Reset search position"}
                title={query ? "Clear" : "Reset position"}
                onClick={() => {
                  if (query) setQuery("");
                  else resetSearchPos();
                }}
                className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Templates */}
            <div className="lg:col-span-5">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/50">
                  Choose blank
                </div>
                <div className="text-[11px] text-gray-400">
                  {loading ? "…" : `${filteredTemplates.length} shown`}
                </div>
              </div>
              {loading ? (
                <div className="flex items-center gap-3 text-gray-500 dark:text-white/60 py-8">
                  <Spinner /> Loading templates from memes.sol.new…
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto pr-1">
                  {filteredTemplates.length === 0 && (
                    <div className="col-span-full text-gray-500 dark:text-white/50 text-sm py-8 text-center">
                      No templates match this filter.
                    </div>
                  )}
                  {filteredTemplates.slice(0, 48).map((tpl) => {
                    const isActive = selected?.id === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => pickTemplate(tpl)}
                        className={`group relative rounded-2xl overflow-hidden border aspect-[4/3] bg-black/5 dark:bg-white/5 text-left transition ${
                          isActive
                            ? "border-pink-500 dark:border-pink-400 ring-1 ring-pink-500/20"
                            : "border-black/10 dark:border-white/10 hover:border-pink-400/40"
                        }`}
                      >
                        <img
                          src={tpl.blank}
                          alt={tpl.name}
                          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
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
                        <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/85 to-transparent text-xs font-semibold text-white leading-snug">
                          {tpl.name}
                          {tpl.face && (
                            <span className="ml-1 text-[10px] text-white/55">· {tpl.face}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Editor + Preview */}
            <div className="lg:col-span-7">
              {!selected ? (
                <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-10 text-center text-gray-500 dark:text-white/60">
                  Select a template to start
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-3xl overflow-hidden border border-black/10 dark:border-white/10 bg-black aspect-square max-h-[560px] flex items-center justify-center">
                    <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
                  </div>

                  <div className="grid gap-3">
                    {captions.map((cap, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-14 text-[10px] uppercase tracking-widest text-gray-400 pt-1">
                          {i === 0 ? "TOP" : i === captions.length - 1 ? "BOTTOM" : `L${i + 1}`}
                        </div>
                        <input
                          value={cap}
                          onChange={(e) => updateCaption(i, e.target.value)}
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
                      onClick={resetCaptions}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 dark:border-white/10 px-5 py-3 text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-white transition"
                    >
                      <RefreshCw size={16} /> Reset
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-400 dark:text-white/35 px-1">
                    Templates from{" "}
                    <a href="https://memes.sol.new" target="_blank" rel="noreferrer" className="underline">
                      memes.sol.new
                    </a>
                    . Exports include a <span className="font-medium text-gray-500 dark:text-white/50">sol.new</span>{" "}
                    watermark.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
