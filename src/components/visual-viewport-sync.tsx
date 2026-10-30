"use client";

import { useEffect } from "react";

/**
 * Keeps CSS vars in sync with the *visual* viewport (iOS Safari keyboard,
 * browser chrome show/hide, rotation). Prefer these over 100vh.
 *
 *   --vvh  visual viewport height (px)
 *   --vvw  visual viewport width (px)
 *   --vv-offset-top  visualViewport.offsetTop (px) — for fixed overlays
 *   --app-height  alias of --vvh for min-height shells
 *   --sat/sar/sab/sal  safe-area insets (px, measured)
 */
export function VisualViewportSync() {
  useEffect(() => {
    const root = document.documentElement;

    const write = () => {
      const vv = window.visualViewport;
      const h = Math.round(vv?.height ?? window.innerHeight);
      const w = Math.round(vv?.width ?? window.innerWidth);
      const ot = Math.round(vv?.offsetTop ?? 0);
      const ol = Math.round(vv?.offsetLeft ?? 0);

      root.style.setProperty("--vvh", `${h}px`);
      root.style.setProperty("--vvw", `${w}px`);
      root.style.setProperty("--vv-offset-top", `${ot}px`);
      root.style.setProperty("--vv-offset-left", `${ol}px`);
      root.style.setProperty("--app-height", `${h}px`);

      // Measured safe areas (env() can lag; expose numeric too)
      const probe = document.getElementById("solnew-safe-probe");
      if (probe) {
        const cs = getComputedStyle(probe);
        root.style.setProperty("--sat", cs.paddingTop);
        root.style.setProperty("--sar", cs.paddingRight);
        root.style.setProperty("--sab", cs.paddingBottom);
        root.style.setProperty("--sal", cs.paddingLeft);
      }

      root.dataset.vvReady = "1";
    };

    write();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", write);
    vv?.addEventListener("scroll", write);
    window.addEventListener("resize", write);
    window.addEventListener("orientationchange", write);
    // iOS often settles layout a frame after orientation
    const onOrient = () => {
      requestAnimationFrame(() => requestAnimationFrame(write));
    };
    window.addEventListener("orientationchange", onOrient);

    return () => {
      vv?.removeEventListener("resize", write);
      vv?.removeEventListener("scroll", write);
      window.removeEventListener("resize", write);
      window.removeEventListener("orientationchange", write);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);

  return (
    <div
      id="solnew-safe-probe"
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 -z-[999] h-0 w-0 overflow-hidden opacity-0"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    />
  );
}
