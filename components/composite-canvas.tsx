"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

// Live composite preview, rendered entirely in the browser so every adjustment
// responds instantly (no server round-trip). A faithful port of the formatter's
// live_preview.py / compose_scene: the coin cut-outs and backdrop are fixed
// layers; reflection (length / strength / perspective), floor glow / shadow,
// gap, padding, top/bottom edge, and a custom background colour draw on top.

export type CompositeCanvasHandle = {
  /** Render the scene at full (2048px) resolution and return a PNG blob. */
  export2048: () => Promise<Blob | null>;
};

const OUT = 2048; // pixel constants are defined at 2048px, scaled by S
const PREVIEW = 768; // internal preview resolution (crisp; fast to redraw)
const SHADOW_BG = "/composite-shadow-bg.png"; // exact default dark gradient + vignette
const REFL_MAX = 1.0; // config CAPS.max_reflection_length
const STR_MAX = 0.8; // config CAPS.max_reflection_opacity
const REFL_DEFAULT = 0.42;
const BG_OUTER = 0.22; // custom studio backdrop: corner colour = base × this
const BG_VIGNETTE = 0.12;

export type CanvasAdjust = {
  reflection: boolean;
  floorGlow: boolean;
  floorShadow: boolean;
  gap: number; // 0-60 (% of coin height)
  padding: number; // 2-40 (% of frame)
  reflLen: number; // 5-100 (% of coin height)
  reflStr: number; // 5-80 (%)
  reflSpread: number; // 0.5-2.5 (bottom width ×)
  reflDepth: number; // 0.3-1.6 (height ×)
  reflSkew: number; // -1.5-1.5 (light direction)
  cropTop: number; // -40-40 (% of width)
  cropBottom: number; // -40-40 (% of width)
  bgColor: string; // "" = the style's default backdrop; else "#rrggbb"
};

// Where the visible reflection's bottom sits, per canvas size — so the drag
// handles can be placed on it (mirrors live_preview.py's sceneGeom).
type Geom = {
  mid: number; // coin centre x
  ry: number; // reflection top y (in the square scene, before edge crop)
  tw: number;
  th: number;
  L: number; // reflection length fraction
  vL: number; // visible bottom row fraction
  drop: number; // how far below ry the reflection reaches
  shift: number; // horizontal lean of the bottom centre (skew)
  halfW: number; // half-width of the reflection at its bottom
  yEnd: number; // ry + drop
};
const sceneGeom = new Map<number, Geom>();

function mk(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Gradient position t + vignette factor f per pixel, per canvas size (colour-independent).
const mapCache = new Map<string, { T: Float32Array; F: Float32Array }>();
function gradientMaps(W: number, H: number, v: number) {
  const key = W + "x" + H + "|" + v;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const T = new Float32Array(W * H),
    F = new Float32Array(W * H);
  const gcx = 0.5 * W,
    gcy = 0.42 * H;
  const maxR =
    Math.max(
      Math.hypot(gcx, gcy),
      Math.hypot(W - gcx, gcy),
      Math.hypot(gcx, H - gcy),
      Math.hypot(W - gcx, H - gcy),
    ) *
      1.05 +
    1e-6;
  const vcx = W / 2,
    vcy = H / 2;
  const vmax =
    Math.hypot(Math.max(vcx, W - 1 - vcx), Math.max(vcy, H - 1 - vcy)) + 1e-6;
  for (let yy = 0, k = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++, k++) {
      T[k] = Math.min(1, Math.hypot(xx - gcx, yy - gcy) / maxR);
      F[k] = v > 0 ? 1 - v * Math.pow(Math.hypot(xx - vcx, yy - vcy) / vmax, 2.2) : 1;
    }
  }
  const maps = { T, F };
  mapCache.set(key, maps);
  return maps;
}

const bgCache = new Map<string, HTMLCanvasElement>();
function customBackdrop(studio: boolean, hex: string, W: number, H: number) {
  const key = (studio ? "s" : "f") + hex + "|" + W;
  const hit = bgCache.get(key);
  if (hit) return hit;
  const c = mk(W, H);
  const x = c.getContext("2d")!;
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  if (!studio) {
    x.fillStyle = hex;
    x.fillRect(0, 0, W, H);
  } else {
    const or_ = Math.round(r * BG_OUTER),
      og = Math.round(g * BG_OUTER),
      ob = Math.round(b * BG_OUTER);
    const { T, F } = gradientMaps(W, H, BG_VIGNETTE);
    const img = x.createImageData(W, H),
      px = img.data;
    for (let k = 0, i = 0; k < T.length; k++, i += 4) {
      const t = T[k],
        f = F[k];
      px[i] = Math.min(255, Math.max(0, Math.trunc(Math.trunc(r * (1 - t) + or_ * t) * f)));
      px[i + 1] = Math.min(255, Math.max(0, Math.trunc(Math.trunc(g * (1 - t) + og * t) * f)));
      px[i + 2] = Math.min(255, Math.max(0, Math.trunc(Math.trunc(b * (1 - t) + ob * t) * f)));
      px[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }
  bgCache.set(key, c);
  return c;
}

/** side_by_side: size-match the coins to one height and join with a gap. */
function combine(coins: HTMLImageElement[], gapPct: number) {
  if (coins.length === 1) return coins[0];
  const [o, r] = coins;
  const th = Math.max(o.naturalHeight || 1, r.naturalHeight || 1);
  const ow = Math.max(1, Math.round(((o.naturalWidth || 1) * th) / (o.naturalHeight || 1)));
  const rw = Math.max(1, Math.round(((r.naturalWidth || 1) * th) / (r.naturalHeight || 1)));
  const gap = Math.max(1, Math.round((th * gapPct) / 100));
  const c = mk(ow + gap + rw, th);
  const x = c.getContext("2d")!;
  x.imageSmoothingQuality = "high";
  x.drawImage(o, 0, 0, ow, th);
  x.drawImage(r, ow + gap, 0, rw, th);
  return c;
}

const fadeExp = (L: number) =>
  L <= REFL_DEFAULT ? 1 : 1 - 0.5 * Math.min(1, (L - REFL_DEFAULT) / (1 - REFL_DEFAULT));
const rowSource = (v: number, b: number) => (b * v) / (1 + (b - 1) * v);
const rowOf = (u: number, b: number) => u / (b - (b - 1) * u);
const reachOf = (p: CanvasAdjust) =>
  rowOf(Math.min(REFL_MAX, p.reflLen / 100), p.reflSpread) * p.reflDepth;

function growRows(
  p: CanvasAdjust,
  H: number,
  bottom: number,
  reflGap: number,
  th: number,
) {
  if (!p.reflection) return 0;
  const reach = reachOf(p);
  const w = Math.min(1, Math.max(0, (reach - REFL_DEFAULT) / 0.13));
  if (w <= 0) return 0;
  const need = bottom + reflGap + Math.trunc(th * reach) + Math.round(0.02 * H) - H;
  return Math.max(0, Math.round(need * w));
}

/** Warp the flipped, faded reflection into the perspective trapezoid, row by row. */
function warpReflection(rc: HTMLCanvasElement, b: number, d: number, k: number) {
  if (Math.abs(b - 1) < 1e-6 && Math.abs(d - 1) < 1e-6 && Math.abs(k) < 1e-6)
    return { img: rc, xoff: 0 };
  const w = rc.width,
    h = rc.height;
  const wo = Math.max(w, Math.ceil(w * b)),
    ho = Math.max(1, Math.round(h * d));
  const lean = Math.abs(k) * ho,
    wt = wo + Math.ceil(lean);
  const xc0 = wo / 2 + (k < 0 ? lean : 0);
  const out = mk(wt, ho);
  const x = out.getContext("2d")!;
  x.imageSmoothingQuality = "high";
  for (let yo = 0; yo < ho; yo++) {
    const v = (yo + 0.5) / ho,
      u = rowSource(v, b),
      f = 1 + (b - 1) * v;
    const ys = Math.min(h - 1, Math.max(0, Math.floor(u * h)));
    const rw = w * f,
      xc = xc0 + k * (yo + 0.5);
    x.drawImage(rc, 0, ys, w, 1, xc - rw / 2, yo, rw, 1);
  }
  return { img: out, xoff: xc0 - w / 2 };
}

/** The square scene (may grow taller for a long reflection). */
function renderScene(
  cv: HTMLCanvasElement,
  coins: HTMLImageElement[],
  bgImg: HTMLImageElement | null,
  studio: boolean,
  p: CanvasAdjust,
) {
  const W = cv.width,
    H = W,
    S = W / OUT;
  const coin = combine(coins, p.gap);
  // Padding: full amount top & bottom, half left & right (Bydd's tighter sides).
  const maxH = Math.min(0.98, Math.max(0.15, 1 - (2 * p.padding) / 100));
  const maxW = Math.min(0.98, Math.max(0.15, 1 - p.padding / 100));
  const fit = Math.min((W * maxW) / coin.width, (H * maxH) / coin.height);
  const tw = Math.max(1, Math.round(coin.width * fit)),
    th = Math.max(1, Math.round(coin.height * fit));
  const floor = p.floorGlow || p.floorShadow,
    staged = p.reflection || floor;
  const vo = floor ? -0.06 : staged ? -0.02 : 0;
  const cx = Math.floor((W - tw) / 2),
    cy = Math.floor(Math.floor((H - th) / 2) + vo * H);
  const bottom = cy + th,
    floorY = bottom + 0.05 * th;
  const reflGap = p.floorShadow
    ? Math.floor(floorY - bottom + 0.05 * th)
    : Math.round(8 * S);

  const Hs = H + growRows(p, H, bottom, reflGap, th);
  if (cv.height !== Hs) cv.height = Hs;
  const ctx = cv.getContext("2d")!;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.imageSmoothingQuality = "high";
  const backdrop =
    studio && !p.bgColor
      ? bgImg
      : customBackdrop(studio, p.bgColor || (studio ? "#222224" : "#ffffff"), W, H);
  if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
  else {
    ctx.fillStyle = "#0c0c0d";
    ctx.fillRect(0, 0, W, H);
  }
  if (Hs > H) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, 0, H - 1, W, 1, 0, H, W, Hs - H);
    ctx.imageSmoothingEnabled = true;
  }

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

  if (p.floorShadow) {
    const fw = Math.max(1, tw),
      fh = Math.max(2, Math.round(th * 0.06));
    const sil = mk(fw, fh);
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
  }

  if (p.reflection) {
    const rc = mk(tw, th);
    const rx = rc.getContext("2d")!;
    rx.imageSmoothingQuality = "high";
    rx.translate(0, th);
    rx.scale(1, -1);
    rx.drawImage(coin, 0, 0, tw, th);
    rx.setTransform(1, 0, 0, 1, 0, 0);
    rx.globalCompositeOperation = "destination-in";
    const L = Math.min(REFL_MAX, p.reflLen / 100),
      e = fadeExp(L);
    const cut = Math.max(1, th * L);
    const lg = rx.createLinearGradient(0, 0, 0, cut);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      lg.addColorStop(
        t,
        `rgba(0,0,0,${Math.min(STR_MAX, p.reflStr / 100) * Math.pow(1 - t, e)})`,
      );
    }
    rx.fillStyle = lg;
    rx.fillRect(0, 0, tw, cut);
    const wr = warpReflection(rc, p.reflSpread, p.reflDepth, p.reflSkew);
    const ry = bottom + reflGap;
    ctx.save();
    ctx.filter = `blur(${2 * S}px)`;
    ctx.drawImage(wr.img, cx - Math.floor(wr.xoff), ry);
    ctx.restore();
    // Record the reflection's bottom edge so the drag handles can sit on it.
    const vLg = rowOf(L, p.reflSpread);
    const dropg = vLg * th * p.reflDepth;
    sceneGeom.set(W, {
      mid: cx + tw / 2,
      ry,
      tw,
      th,
      L,
      vL: vLg,
      drop: dropg,
      shift: p.reflSkew * dropg,
      halfW: (tw / 2) * (1 + (p.reflSpread - 1) * vLg),
      yEnd: ry + dropg,
    });
  } else {
    sceneGeom.delete(W);
  }

  ctx.drawImage(coin, cx, cy, tw, th);
}

// The plain composite matches sample composite.jpg: the two coins side by side
// on a solid background, filling the full height (no top/bottom padding), with
// a small gap and side margins. No reflection, glow, shadow or framing.
const PLAIN_GAP = 2.3; // gap as % of coin height (measured from the sample)
const PLAIN_SIDE = 0.04; // side margin as a fraction of the combined width

function renderPlain(
  target: HTMLCanvasElement,
  coins: HTMLImageElement[],
  bgColor: string,
) {
  const coin = combine(coins, PLAIN_GAP);
  const W = target.width;
  const sideM = Math.round(coin.width * PLAIN_SIDE);
  const contentW = coin.width + 2 * sideM;
  const scale = W / contentW;
  const H = Math.max(1, Math.round(coin.height * scale)); // no top/bottom pad
  if (target.height !== H) target.height = H;
  const ctx = target.getContext("2d")!;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(coin, Math.round(sideM * scale), 0, Math.round(coin.width * scale), H);
}

/** Full render: the square scene, then top/bottom edges cropped / extended. */
function renderFull(
  target: HTMLCanvasElement,
  coins: HTMLImageElement[],
  bgImg: HTMLImageElement | null,
  studio: boolean,
  p: CanvasAdjust,
) {
  if (!coins.length) return;
  // Plain composite: the tight, no-reflection layout (sample composite.jpg).
  if (!studio) {
    renderPlain(target, coins, p.bgColor);
    return;
  }
  const W = target.width;
  const sq = mk(W, W);
  renderScene(sq, coins, bgImg, studio, p);
  const Hs = sq.height;
  const top = Math.round((W * p.cropTop) / 100),
    bottom = Math.round((W * p.cropBottom) / 100);
  const Hn = Math.max(Math.round(W * 0.2), Hs + top + bottom);
  if (target.height !== Hn) target.height = Hn;
  const ctx = target.getContext("2d")!;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = false; // edge rows are repeated, not blended
  ctx.clearRect(0, 0, W, Hn);
  ctx.drawImage(sq, 0, top);
  if (top > 0) ctx.drawImage(sq, 0, 0, W, 1, 0, 0, W, top);
  if (bottom > 0) ctx.drawImage(sq, 0, Hs - 1, W, 1, 0, top + Hs, W, bottom);
  ctx.imageSmoothingEnabled = true;
}

// Drag handles overlaid on the reflection (mirrors live_preview.py's .npf-handle).
// Stable references so React writes them once and never fights the imperative
// left/top/display that placeHandles sets each render.
const ROUND_HANDLE: CSSProperties = {
  position: "absolute",
  width: 18,
  height: 18,
  margin: "-9px 0 0 -9px",
  zIndex: 5,
  borderRadius: "50%",
  background: "#fff",
  border: "2px solid #c88a2e",
  cursor: "grab",
  boxShadow: "0 1px 5px rgba(0,0,0,.55)",
  touchAction: "none",
  display: "none",
};
const DIR_HANDLE: CSSProperties = {
  position: "absolute",
  width: 16,
  height: 16,
  margin: "-8px 0 0 -8px",
  zIndex: 5,
  borderRadius: 3,
  background: "#fff",
  border: "2px solid #3b82f6",
  transform: "rotate(45deg)",
  cursor: "ew-resize",
  boxShadow: "0 1px 5px rgba(0,0,0,.55)",
  touchAction: "none",
  display: "none",
};

export type PerspectiveChange = {
  spread: number;
  depth: number;
  skew: number;
};

export const CompositeCanvas = forwardRef<
  CompositeCanvasHandle,
  {
    coinUrls: string[];
    background: string;
    /** Drag callback for the perspective / light-direction handles. */
    onPerspective?: (p: PerspectiveChange) => void;
  } & CanvasAdjust
>(function CompositeCanvas({ coinUrls, background, onPerspective, ...p }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coinsRef = useRef<HTMLImageElement[]>([]);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const hlRef = useRef<HTMLDivElement>(null); // reflection bottom-left
  const hrRef = useRef<HTMLDivElement>(null); // reflection bottom-right
  const hdRef = useRef<HTMLDivElement>(null); // light-direction (diamond)
  const draggingRef = useRef<null | "lr" | "d">(null);
  const [loaded, setLoaded] = useState(0);
  const studio = background === "shadow";
  const key = coinUrls.join("|") + "::" + background;
  const adjust: CanvasAdjust = p;
  // Latest values for the drag math / handle placement, read without re-binding.
  const pRef = useRef(p);
  pRef.current = p;
  const onPerspRef = useRef(onPerspective);
  onPerspRef.current = onPerspective;

  // Put the three handles on the reflection's bottom edge (live_preview.placeHandles).
  const placeHandles = useCallback(() => {
    const cv = canvasRef.current,
      hl = hlRef.current,
      hr = hrRef.current,
      hd = hdRef.current;
    if (!cv || !hl || !hr || !hd) return;
    const g = sceneGeom.get(cv.width);
    if (!onPerspRef.current || !pRef.current.reflection || !g) {
      hl.style.display = hr.style.display = hd.style.display = "none";
      return;
    }
    const k = cv.clientWidth / cv.width;
    const top = Math.round((cv.width * pRef.current.cropTop) / 100);
    const y = (g.yEnd + top) * k;
    const c = g.mid + g.shift;
    const cw = cv.clientWidth;
    const clampX = (v: number) => Math.min(cw - 6, Math.max(6, v));
    const ox = cv.offsetLeft,
      oy = cv.offsetTop;
    hl.style.left = ox + clampX((c - g.halfW) * k) + "px";
    hr.style.left = ox + clampX((c + g.halfW) * k) + "px";
    hd.style.left = ox + clampX(c * k) + "px";
    hl.style.top = hr.style.top = hd.style.top = oy + y + "px";
    const disp = y > 0 && y < cv.clientHeight ? "block" : "none";
    hl.style.display = hr.style.display = hd.style.display = disp;
  }, []);

  const startDrag = (kind: "lr" | "d") => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = kind;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };
  const moveDrag = (kind: "lr" | "d") => (e: ReactPointerEvent) => {
    if (draggingRef.current !== kind) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const g = sceneGeom.get(cv.width);
    const cb = onPerspRef.current;
    if (!g || !cb) return;
    const rect = cv.getBoundingClientRect();
    const k = cv.clientWidth / cv.width;
    const cur = pRef.current;
    if (kind === "lr") {
      const x = (e.clientX - rect.left) / k;
      const yy =
        (e.clientY - rect.top) / k - Math.round((cv.width * cur.cropTop) / 100);
      // Distance from the centre line → the row's width → the spread (solved
      // iteratively because the visible row fraction itself depends on spread).
      const R = Math.abs(x - (g.mid + g.shift)) / (g.tw / 2);
      let b = cur.reflSpread;
      for (let i = 0; i < 6; i++) {
        const vL = Math.max(0.05, rowOf(g.L, b));
        b = Math.min(2.5, Math.max(0.5, 1 + (R - 1) / vL));
      }
      const vL = Math.max(0.05, rowOf(g.L, b));
      const d = Math.min(1.6, Math.max(0.3, (yy - g.ry) / (vL * g.th)));
      cb({ spread: +b.toFixed(3), depth: +d.toFixed(3), skew: cur.reflSkew });
    } else {
      if (g.drop <= 0) return;
      const x = (e.clientX - rect.left) / k;
      const skew = Math.min(1.5, Math.max(-1.5, (x - g.mid) / g.drop));
      cb({ spread: cur.reflSpread, depth: cur.reflDepth, skew: +skew.toFixed(3) });
    }
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  useImperativeHandle(
    ref,
    () => ({
      export2048: () =>
        new Promise<Blob | null>((resolve) => {
          if (!coinsRef.current.length) return resolve(null);
          const off = mk(OUT, OUT);
          renderFull(off, coinsRef.current, bgRef.current, studio, adjust);
          try {
            off.toBlob((b) => resolve(b), "image/png");
          } catch {
            resolve(null);
          }
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [studio, ...Object.values(adjust)],
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
      studio ? load(SHADOW_BG) : Promise.resolve(null),
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
    if (cv) renderFull(cv, coinsRef.current, bgRef.current, studio, adjust);
    placeHandles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, studio, ...Object.values(adjust)]);

  // Reposition the handles when the canvas is resized (responsive width).
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => placeHandles());
    ro.observe(cv);
    return () => ro.disconnect();
  }, [placeHandles]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={PREVIEW}
        height={PREVIEW}
        className="w-full rounded-lg border bg-muted"
      />
      <div
        ref={hlRef}
        style={ROUND_HANDLE}
        title="Drag to change the reflection's perspective"
        onPointerDown={startDrag("lr")}
        onPointerMove={moveDrag("lr")}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div
        ref={hrRef}
        style={ROUND_HANDLE}
        title="Drag to change the reflection's perspective"
        onPointerDown={startDrag("lr")}
        onPointerMove={moveDrag("lr")}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div
        ref={hdRef}
        style={DIR_HANDLE}
        title="Drag left / right to change the light direction"
        onPointerDown={startDrag("d")}
        onPointerMove={moveDrag("d")}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
});
