"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type CompositeCanvasHandle = {
  /** Render the current scene at full (2048px) resolution and return a PNG blob. */
  export2048: () => Promise<Blob | null>;
};

// Live composite preview, rendered entirely in the browser so the adjustments
// respond instantly (no server round-trip). This mirrors the formatter's
// compose_scene / live_preview.py exactly: the coin cut-outs and the backdrop
// are fixed layers, and reflection / floor glow / floor shadow / gap / padding
// are drawn on top. The high-quality final is still baked server-side on save.

const OUT = 2048; // the pixel constants below are defined at 2048px, scaled by S
const PREVIEW = 768; // internal canvas resolution (crisp; fast to redraw)
const SHADOW_BG = "/composite-shadow-bg.png"; // pixel-exact dark-gradient + vignette

export type CanvasAdjust = {
  reflection: boolean;
  floorGlow: boolean;
  floorShadow: boolean;
  gap: number; // 0-60 (% of coin height)
  padding: number; // 2-40 (% of frame, top & bottom)
};

/** Size-match the coins to one height and join them with a gap. */
function combine(coins: HTMLImageElement[], gapPct: number): HTMLCanvasElement {
  const th = Math.max(...coins.map((c) => c.naturalHeight || 1));
  const widths = coins.map((c) =>
    Math.max(1, Math.round((c.naturalWidth || 1) * (th / (c.naturalHeight || 1)))),
  );
  const gap = coins.length > 1 ? Math.max(1, Math.round(th * (gapPct / 100))) : 0;
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (coins.length - 1);
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, totalW);
  cv.height = Math.max(1, th);
  const x = cv.getContext("2d")!;
  x.imageSmoothingQuality = "high";
  let px = 0;
  coins.forEach((c, i) => {
    x.drawImage(c, px, 0, widths[i], th);
    px += widths[i] + gap;
  });
  return cv;
}

function render(
  cv: HTMLCanvasElement,
  coins: HTMLImageElement[],
  bg: HTMLImageElement | null,
  background: string,
  p: CanvasAdjust,
) {
  const W = cv.width,
    H = cv.height,
    S = W / OUT;
  const ctx = cv.getContext("2d");
  if (!ctx || !coins.length) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, W, H);

  // Backdrop: the studio gradient image, or a solid colour.
  if (background === "shadow" && bg) ctx.drawImage(bg, 0, 0, W, H);
  else {
    ctx.fillStyle = background === "shadow" ? "#0c0c0d" : background;
    ctx.fillRect(0, 0, W, H);
  }

  const coin = combine(coins, p.gap);
  const maxH = Math.min(0.98, Math.max(0.15, 1 - (2 * p.padding) / 100));
  const fit = Math.min((W * 0.9) / coin.width, (H * maxH) / coin.height);
  const tw = Math.max(1, Math.round(coin.width * fit));
  const th = Math.max(1, Math.round(coin.height * fit));
  const floor = p.floorGlow || p.floorShadow;
  const staged = p.reflection || floor;
  const vo = floor ? -0.06 : staged ? -0.02 : 0;
  const cx = Math.floor((W - tw) / 2);
  const cy = Math.floor(Math.floor((H - th) / 2) + vo * H);
  const bottom = cy + th;
  const floorY = bottom + 0.05 * th;

  // Floor glow: additive elliptical Gaussian pool of light.
  if (p.floorGlow) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(W / 2, floorY);
    ctx.scale(0.4 * W, 0.075 * H);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 3);
    for (let i = 0; i <= 30; i++) {
      const r = i / 10;
      g.addColorStop(i / 30, `rgba(255,247,230,${0.3 * Math.exp(-r * r)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  // Floor shadow: the coin silhouette flattened to 6% height, blurred.
  let reflGap = Math.round(8 * S);
  if (p.floorShadow) {
    const fw = Math.max(1, tw);
    const fh = Math.max(2, Math.round(th * 0.06));
    const sil = document.createElement("canvas");
    sil.width = fw;
    sil.height = fh;
    const sx = sil.getContext("2d")!;
    sx.drawImage(coin, 0, 0, fw, fh);
    sx.globalCompositeOperation = "source-in";
    sx.fillStyle = "#000";
    sx.fillRect(0, 0, fw, fh);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.filter = `blur(${Math.max(2 * S, th * 0.012)}px)`;
    ctx.drawImage(sil, cx + (tw - fw) / 2, floorY - fh / 2);
    ctx.restore();
    reflGap = Math.floor(floorY - bottom + 0.05 * th);
  }

  // Mirror reflection: flipped coin, alpha 0.26 → 0 over 42% of its height.
  if (p.reflection) {
    const rc = document.createElement("canvas");
    rc.width = tw;
    rc.height = th;
    const rx = rc.getContext("2d")!;
    rx.imageSmoothingQuality = "high";
    rx.translate(0, th);
    rx.scale(1, -1);
    rx.drawImage(coin, 0, 0, tw, th);
    rx.setTransform(1, 0, 0, 1, 0, 0);
    rx.globalCompositeOperation = "destination-in";
    const cut = Math.max(1, th * 0.42);
    const lg = rx.createLinearGradient(0, 0, 0, cut);
    lg.addColorStop(0, "rgba(0,0,0,0.26)");
    lg.addColorStop(1, "rgba(0,0,0,0)");
    rx.fillStyle = lg;
    rx.fillRect(0, 0, tw, cut);
    ctx.save();
    ctx.filter = `blur(${2 * S}px)`;
    ctx.drawImage(rc, cx, bottom + reflGap);
    ctx.restore();
  }

  ctx.drawImage(coin, cx, cy, tw, th);
}

export const CompositeCanvas = forwardRef<
  CompositeCanvasHandle,
  {
    coinUrls: string[];
    background: string;
  } & CanvasAdjust & { onClick?: () => void }
>(function CompositeCanvas(
  {
    coinUrls,
    background,
    reflection,
    floorGlow,
    floorShadow,
    gap,
    padding,
    onClick,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coinsRef = useRef<HTMLImageElement[]>([]);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(0);
  const key = coinUrls.join("|") + "::" + background;

  useImperativeHandle(
    ref,
    () => ({
      export2048: () =>
        new Promise<Blob | null>((resolve) => {
          if (!coinsRef.current.length) return resolve(null);
          const off = document.createElement("canvas");
          off.width = OUT;
          off.height = OUT;
          render(off, coinsRef.current, bgRef.current, background, {
            reflection,
            floorGlow,
            floorShadow,
            gap,
            padding,
          });
          try {
            off.toBlob((b) => resolve(b), "image/png");
          } catch {
            resolve(null);
          }
        }),
    }),
    [background, reflection, floorGlow, floorShadow, gap, padding],
  );

  useEffect(() => {
    let cancelled = false;
    const load = (src: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });
    Promise.all([
      Promise.all(coinUrls.map(load)),
      background === "shadow" ? load(SHADOW_BG) : Promise.resolve(null),
    ])
      .then(([coins, bgimg]) => {
        if (cancelled) return;
        coinsRef.current = coins;
        bgRef.current = bgimg;
        setLoaded((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (cv)
      render(cv, coinsRef.current, bgRef.current, background, {
        reflection,
        floorGlow,
        floorShadow,
        gap,
        padding,
      });
  }, [loaded, background, reflection, floorGlow, floorShadow, gap, padding]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW}
      height={PREVIEW}
      onClick={onClick}
      className={
        "aspect-square w-full rounded-lg border bg-muted" +
        (onClick ? " cursor-zoom-in" : "")
      }
    />
  );
});
