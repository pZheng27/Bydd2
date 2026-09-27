"use client";

import { useEffect, useState } from "react";

/**
 * Read a photo's background colour by averaging its four corner pixels, so a
 * short/wide photo can be letterboxed onto a matching solid colour instead of a
 * grey band. Dark backgrounds (studio "shadow" composites, black velvet) snap
 * to solid black. Returns null if the canvas is tainted (cross-origin without
 * CORS) — the caller then falls back to a blurred copy of the photo.
 */
function cornerColor(img: HTMLImageElement): string | null {
  try {
    const n = 32;
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx || !img.naturalWidth) return null;
    ctx.drawImage(img, 0, 0, n, n);
    const corners = [
      [0, 0],
      [n - 1, 0],
      [0, n - 1],
      [n - 1, n - 1],
    ];
    let r = 0,
      g = 0,
      b = 0;
    for (const [x, y] of corners) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      r += d[0];
      g += d[1];
      b += d[2];
    }
    r = Math.round(r / 4);
    g = Math.round(g / 4);
    b = Math.round(b / 4);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance < 90) return "#000000";
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return null;
  }
}

/**
 * A uniform (square) coin-photo tile. The photo is shown whole (object-contain);
 * the space around a short/wide photo is filled with the photo's own background
 * colour (black for dark "shadow" composites) so every card is the same size
 * with no grey bands. Until the colour is sampled — or if it can't be (the host
 * sends no CORS headers) — a blurred copy of the photo fills in.
 */
export function CoinTileImage({ src, alt }: { src: string; alt: string }) {
  const [bg, setBg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      if (cancelled) return;
      const c = cornerColor(probe);
      if (c) setBg(c);
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      className="relative aspect-square overflow-hidden bg-muted"
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {!bg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </div>
  );
}
