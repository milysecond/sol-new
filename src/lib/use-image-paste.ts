"use client";

import { useEffect } from "react";

/**
 * Listen for clipboard paste events containing an image and call the handler
 * with a File. Ignores pastes targeting text inputs unless the clipboard is
 * image-only, so users can still paste text into the description / social
 * fields without hijacking it.
 */
export function useImagePaste(onImage: (file: File) => void) {
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const cd = e.clipboardData;
      if (!cd) return;
      const items = Array.from(cd.items || []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (!imageItem) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (target as HTMLElement).isContentEditable) {
          // Only hijack when the clipboard is image-only (no text alongside)
          const hasText = items.some((i) => i.type.startsWith("text/"));
          if (hasText) return;
        }
      }

      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        onImage(file);
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [onImage]);
}
