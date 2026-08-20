"use client";

import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { Download, Share2, RefreshCw } from "lucide-react";

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
};

const MEMES_API = "https://memes.sol.new";

/** Same-origin proxy — memes.sol.new blanks have no CORS (breaks crossOrigin img/canvas). */
function proxiedBlank(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/memes/blank")) return url;
  try {
    const u = new URL(url, MEMES_API);
    if (u.hostname.endsWith("memes.sol.new") || u.pathname.startsWith("/templates/")) {
      return `/api/memes/blank?url=${encodeURIComponent(u.toString())}`;
    }
  } catch {}
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
    face: raw.face,
    tag: raw.tag,
    lines: raw.lines,
    boxes: raw.boxes,
    featured: !!raw.featured,
  };
}

export default function MemesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [captions, setCaptions] = useState<string[]>(["", ""]);
  const [filter, setFilter] = useState<"all" | "toly">("toly");
  const [generating, setGenerating] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Fetch templates from memes.sol.new API
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${MEMES_API}/api/templates?limit=80`);
        const data = (await res.json()) as { items?: any[] };
        let items: Template[] = (data.items || []).map(normalizeTemplate);

        // Prefer Toly faces + popular originals
        const tolyFaces = items.filter((t) => {
          const id = t.id.toLowerCase();
          return id.includes("toly") || (t.face || "").toLowerCase() === "toly";
        });

        const popular = items.filter((t) => t.featured || ["screaming", "toly-screaming"].includes(t.id));

        let final = [...tolyFaces, ...popular.filter((p) => !tolyFaces.some((f) => f.id === p.id))];

        if (final.length < 6) final = items.slice(0, 12);

        setTemplates(final);

        // default selection: prefer a toly one
        const def =
          final.find((t) => t.id.includes("toly")) ||
          final.find((t) => t.id.includes("screaming")) ||
          final[0];
        if (def) {
          setSelected(def);
          const numLines = def.boxes?.length || def.lines || 2;
          setCaptions(Array(numLines).fill("").map((_, i) => (i === 0 ? "ME" : "WHEN I SEE THE CHART")));
        }
      } catch (e) {
        // Fallback hardcoded Toly templates
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
          {
            id: "toly-chamath",
            name: "Toly Chamath Pompass",
            blank: proxiedBlank(`${MEMES_API}/templates/toly-chamath-pompass.jpg`),
            blankRaw: `${MEMES_API}/templates/toly-chamath-pompass.jpg`,
            face: "toly",
            boxes: [
              { id: "top", x: 0.05, y: 0.03, w: 0.9, h: 0.16, style: "impact", align: "center" },
              { id: "bottom", x: 0.05, y: 0.8, w: 0.9, h: 0.16, style: "impact", align: "center" },
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

  // Live render to canvas
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

    // draw background
    ctx.drawImage(img, 0, 0, w, h);

    // draw captions
    const boxes = tpl.boxes && tpl.boxes.length > 0
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
  };

  // Redraw when selection or captions change
  useEffect(() => {
    if (selected) {
      renderToCanvas(selected, captions).catch(() => {});
    }
  }, [selected, captions]);

  const updateCaption = (index: number, value: string) => {
    setCaptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGenerating(true);

    const link = document.createElement("a");
    link.download = `${(selected?.id || "meme")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    setTimeout(() => setGenerating(false), 300);
  };

  const share = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;

    const file = new File([blob], `${selected?.id || "meme"}.png`, { type: "image/png" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "sol.new meme",
          text: captions.filter(Boolean).join(" / "),
        });
        return;
      } catch {}
    }

    // Fallback: open X intent with text
    const text = encodeURIComponent(
      `${captions.filter(Boolean).join(" ")} via @solnew`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  };

  const resetCaptions = () => {
    if (!selected) return;
    const n = selected.boxes?.length || 2;
    setCaptions(Array(n).fill("").map((_, i) => (i === 0 ? "ME" : "SOL GOES BRRR")));
  };

  const filteredTemplates = filter === "toly"
    ? templates.filter((t) => {
        const id = t.id.toLowerCase();
        return id.includes("toly");
      })
    : templates;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 sm:py-8 space-y-8">
          <div className="text-center space-y-3">
            <div className="text-xs uppercase tracking-[3px] text-pink-500 dark:text-pink-400 font-semibold">TOLY</div>
            <h1 className="text-3xl font-bold tracking-tight">Memes</h1>
            <p className="text-gray-500 dark:text-white/50 max-w-md mx-auto">
              Solana Australia blanks from memes.sol.new. Caption, preview, download, share.
            </p>
          </div>

          <div className="flex justify-center gap-2 text-sm">
            <button
              onClick={() => setFilter("toly")}
              className={`px-5 py-1.5 rounded-xl border transition ${filter === "toly" ? "bg-pink-500 text-black border-pink-400" : "border-white/15 hover:bg-white/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/70"}`}
            >
              Toly
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`px-5 py-1.5 rounded-xl border transition ${filter === "all" ? "bg-pink-500 text-black border-pink-400" : "border-white/15 hover:bg-white/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/70"}`}
            >
              All templates
            </button>
          </div>

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Templates */}
            <div className="lg:col-span-5">
              <div className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/50 mb-3 px-1">Choose blank</div>
              {loading ? (
                <div className="flex items-center gap-3 text-gray-500 dark:text-white/60 py-8">
                  <Spinner /> Loading templates from memes.sol.new…
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredTemplates.length === 0 && (
                    <div className="col-span-full text-gray-500 dark:text-white/50 text-sm">No Toly templates. Showing all available.</div>
                  )}
                  {(filteredTemplates.length ? filteredTemplates : templates).slice(0, 18).map((tpl) => {
                    const isActive = selected?.id === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => {
                          setSelected(tpl);
                          const n = tpl.boxes?.length || tpl.lines || 2;
                          setCaptions(Array(n).fill("").map((_, i) => (i === 0 ? "ME" : "WHEN I CHECK THE CHART")));
                        }}
                        className={`group relative rounded-2xl overflow-hidden border aspect-[4/3] bg-black/5 dark:bg-white/5 text-left transition ${isActive ? "border-pink-500 dark:border-pink-400 ring-1 ring-pink-500/20" : "border-black/10 dark:border-white/10 hover:border-pink-400/40"}`}
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
                            // Fallback to direct blank if proxy fails once
                            if (tpl.blankRaw && !el.dataset.fallback) {
                              el.dataset.fallback = "1";
                              el.removeAttribute("crossorigin");
                              el.src = tpl.blankRaw;
                            }
                          }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-black/30 text-sm font-semibold text-white">
                          {tpl.name}
                          {tpl.face && <span className="ml-1.5 text-[10px] text-white/60">• {tpl.face}</span>}
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
                        <div className="w-12 text-[10px] uppercase tracking-widest text-gray-400 pt-2">{i === 0 ? "TOP" : "BOTTOM"}</div>
                        <input
                          value={cap}
                          onChange={(e) => updateCaption(i, e.target.value)}
                          placeholder={i === 0 ? "TOP TEXT" : "BOTTOM TEXT"}
                          className="flex-1 bg-zinc-950 border border-black/10 dark:border-white/10 focus:border-pink-500/60 rounded-2xl px-5 py-3 text-xl font-semibold tracking-tight placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none"
                          maxLength={80}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      onClick={download}
                      disabled={generating}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 hover:bg-pink-400 text-black font-semibold px-6 py-3 transition active:scale-[0.985]"
                    >
                      <Download size={18} /> Download PNG
                    </button>
                    <button
                      onClick={share}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 dark:border-white/10 px-6 py-3 font-medium hover:bg-black/5 dark:hover:bg-white/5 transition"
                    >
                      <Share2 size={18} /> Share
                    </button>
                    <button
                      onClick={resetCaptions}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 dark:border-white/10 px-5 py-3 text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-white transition"
                    >
                      <RefreshCw size={16} /> Reset
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-400 dark:text-white/35 px-1">
                    Templates from <a href="https://memes.sol.new" target="_blank" className="underline">memes.sol.new</a> — rendered client-side on sol.new.
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
