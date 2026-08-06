"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme-context";

/** Brand Toaster — purple accents, follows light/dark. */
export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "border border-violet-500/20 shadow-lg shadow-violet-500/10 font-medium",
          success: "border-emerald-500/30",
          error: "border-red-500/30",
        },
      }}
    />
  );
}
