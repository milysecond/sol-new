"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  innerW: number;
  innerH: number;
  vvW: number;
  vvH: number;
  vvOt: number;
  vvOl: number;
  dpr: number;
  sat: string;
  sab: string;
  sal: string;
  sar: string;
  ready: boolean;
};

function read(): Snapshot {
  if (typeof window === "undefined") {
    return {
      innerW: 0,
      innerH: 0,
      vvW: 0,
      vvH: 0,
      vvOt: 0,
      vvOl: 0,
      dpr: 1,
      sat: "0",
      sab: "0",
      sal: "0",
      sar: "0",
      ready: false,
    };
  }
  const vv = window.visualViewport;
  const cs = getComputedStyle(document.documentElement);
  return {
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    vvW: Math.round(vv?.width ?? window.innerWidth),
    vvH: Math.round(vv?.height ?? window.innerHeight),
    vvOt: Math.round(vv?.offsetTop ?? 0),
    vvOl: Math.round(vv?.offsetLeft ?? 0),
    dpr: window.devicePixelRatio || 1,
    sat: cs.getPropertyValue("--sat").trim() || "0px",
    sab: cs.getPropertyValue("--sab").trim() || "0px",
    sal: cs.getPropertyValue("--sal").trim() || "0px",
    sar: cs.getPropertyValue("--sar").trim() || "0px",
    ready: document.documentElement.dataset.vvReady === "1",
  };
}

/** Live viewport readout for /lab — proves measure on real devices. */
export function ViewportMeasurePanel() {
  const [s, setS] = useState<Snapshot | null>(null);

  useEffect(() => {
    const tick = () => setS(read());
    tick();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", tick);
    vv?.addEventListener("scroll", tick);
    window.addEventListener("resize", tick);
    window.addEventListener("orientationchange", tick);
    const id = window.setInterval(tick, 500);
    return () => {
      vv?.removeEventListener("resize", tick);
      vv?.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
      window.removeEventListener("orientationchange", tick);
      clearInterval(id);
    };
  }, []);

  if (!s) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-3 text-xs text-gray-500">
        Measuring…
      </div>
    );
  }

  const rows: [string, string | number][] = [
    ["visual W×H", `${s.vvW} × ${s.vvH}`],
    ["inner W×H", `${s.innerW} × ${s.innerH}`],
    ["vv offset", `${s.vvOl}, ${s.vvOt}`],
    ["DPR", s.dpr],
    ["safe top", s.sat],
    ["safe bottom", s.sab],
    ["safe L/R", `${s.sal} / ${s.sar}`],
    ["sync", s.ready ? "ready" : "pending"],
  ];

  return (
    <div className="rounded-xl border border-purple-400/30 bg-purple-500/[0.06] p-3 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-300">
        Live viewport
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500 dark:text-white/40">{k}</dt>
            <dd className="font-mono tabular-nums text-gray-900 dark:text-white text-right">
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Open keyboard on iOS — height should shrink. Rotate — width/height swap. Sheets use{" "}
        <code className="text-purple-500">--vvh</code>.
      </p>
    </div>
  );
}
