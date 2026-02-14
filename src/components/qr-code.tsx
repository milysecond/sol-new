"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCode({ data, size = 200, className }: { data: string; size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;
    QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {});
  }, [data, size]);

  return <canvas ref={canvasRef} className={className} />;
}
