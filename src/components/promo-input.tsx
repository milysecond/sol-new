"use client";

import { useState, useRef } from "react";
import { Tag, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface PromoInputProps {
  onValidCode: (code: string) => void;
  onClear: () => void;
}

export function PromoInput({ onValidCode, onClear }: PromoInputProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [description, setDescription] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = async (code: string) => {
    if (code.length < 4) { setStatus("idle"); onClear(); return; }
    setStatus("checking");
    try {
      const res = await fetch(`/api/promo/validate?code=${encodeURIComponent(code)}`);
      const data = (await res.json()) as { valid?: boolean; description?: string | null };
      if (data.valid) {
        setStatus("valid");
        setDescription(data.description ?? null);
        onValidCode(code);
      } else {
        setStatus("invalid");
        setDescription(null);
        onClear();
      }
    } catch {
      setStatus("idle");
      onClear();
    }
  };

  const handleChange = (v: string) => {
    const upper = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setValue(upper);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => check(upper), 500);
  };

  const clear = () => {
    setValue("");
    setStatus("idle");
    setDescription(null);
    onClear();
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 dark:text-white/30 hover:text-purple-400 dark:hover:text-purple-400 transition flex items-center gap-1"
      >
        <Tag className="w-3 h-3" /> Have a promo code?
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="PROMO CODE"
          maxLength={16}
          className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-purple-400/50 tracking-widest uppercase"
        />
        {status === "checking" && <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-gray-400" />}
        {status === "valid" && <CheckCircle className="absolute right-2.5 top-2.5 w-4 h-4 text-green-400" />}
        {status === "invalid" && <XCircle className="absolute right-2.5 top-2.5 w-4 h-4 text-red-400" />}
      </div>
      <button type="button" onClick={clear} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white/60 transition">
        Cancel
      </button>
      {status === "valid" && (
        <span className="text-xs text-green-400 font-medium whitespace-nowrap">
          ✓ {description ?? "Free launch!"}
        </span>
      )}
      {status === "invalid" && (
        <span className="text-xs text-red-400 whitespace-nowrap">Invalid code</span>
      )}
    </div>
  );
}
