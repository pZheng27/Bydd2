"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { beautifyPhoto, rotatePhoto, warmFormatter } from "@/app/photo-actions";
import { Lightbox } from "@/components/lightbox";
import {
  CompositeCanvas,
  type CompositeCanvasHandle,
} from "@/components/composite-canvas";

type Slot = {
  id: string;
  original: string;
  baseCutout: string | null; // un-rotated cut-out; rotation re-derives from this
  cutout: string | null; // current cut-out (baseCutout rotated by `angle`)
  angle: number; // rotation in degrees, clockwise
  bg: "transparent" | string; // "transparent" or a hex colour, once cut out
  colored: string | null; // the (rotated) cut-out placed on `bg` (a hex colour)
};

const DEFAULT_BG = "#ffffff"; // where a cut-out coin is placed by default

// Studio adjustments applied when generating the composite.
type Adjust = {
  reflection: boolean;
  floorGlow: boolean;
  floorShadow: boolean;
  gap: number; // 0-60 (% of coin height between obverse & reverse)
  padding: number; // 2-40 (% of the frame, top & bottom)
};

const SWATCHES = ["#ffffff", "#f4f4f5", "#111114", "#1e293b", "#3f3f46"];

// The first two photos of a coin are its two sides, labelled by default.
const SLOT_LABELS = ["Obverse", "Reverse"];

/** Normalize free-typed hex ("1e293b", "#abc", "#1E293B") to "#rrggbb" or null. */
function normalizeHex(s: string): string | null {
  let v = s.trim().toLowerCase();
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-f]{3}$/.test(v))
    v = "#" + v.slice(1).split("").map((c) => c + c).join("");
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/** Angle in degrees of (x,y) around centre (cx,cy). */
function angleAt(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

/** Wall-clock timestamp in ms, for the optional on-screen stopwatch. */
const nowMs = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/** A single colour input: a live swatch + one hex text field (no R/G/B trio). */
function HexColorInput({
  value,
  onApply,
  disabled,
}: {
  value: string;
  onApply: (hex: string) => void;
  disabled?: boolean;
}) {
  // Keyed on `value` by the parent, so a new value remounts with fresh text.
  const [text, setText] = useState(value);
  const valid = normalizeHex(text);
  const apply = () => {
    const h = normalizeHex(text);
    if (h) onApply(h);
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-5 w-5 shrink-0 rounded-full border"
        style={{ backgroundColor: valid ?? "transparent" }}
      />
      <input
        type="text"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        placeholder="#1e293b"
        aria-label="Custom background colour (hex)"
        className="w-24 rounded border bg-background px-1.5 py-0.5 text-[11px] outline-none focus:ring-2 focus:ring-ring"
      />
    </span>
  );
}

/**
 * Photo uploader with per-photo processing. "Remove background" places the coin
 * on a white background by default; each photo can then switch to None
 * (transparent) or another solid colour (swatches + one hex input). More than
 * one photo can also be composited (work in progress).
 */
export function PhotoUploader({
  dealerId,
  prefix,
}: {
  dealerId?: string;
  prefix?: string;
}) {
  const folder = prefix ?? dealerId ?? "misc";
  const supabase = createClient();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [composite, setComposite] = useState<string | null>(null);
  // Whether the composite is the listing's main (first) photo. Off by default —
  // the first uploaded photo stays primary unless the user opts in.
  const [compositePrimary, setCompositePrimary] = useState(false);
  const [bg, setBg] = useState<"shadow" | "plain">("shadow");
  // Studio adjustments for the composite (map to the formatter's knobs).
  // Reflection is on by default because the default background is the studio
  // "shadow" look.
  const [reflection, setReflection] = useState(true);
  const [floorGlow, setFloorGlow] = useState(false);
  const [floorShadow, setFloorShadow] = useState(false);
  const [gap, setGap] = useState(6); // % of coin height, obverse↔reverse
  const [padding, setPadding] = useState(14); // % of frame, top & bottom
  const [reflLen, setReflLen] = useState(42); // reflection length, % of coin height
  const [reflStr, setReflStr] = useState(26); // reflection strength (opacity), %
  const [reflSpread, setReflSpread] = useState(1); // perspective: bottom width ×
  const [reflDepth, setReflDepth] = useState(1); // perspective: height ×
  const [reflSkew, setReflSkew] = useState(0); // light direction / lean
  const [cropTop, setCropTop] = useState(0); // top edge: trim (<0) / add (>0) %
  const [cropBottom, setCropBottom] = useState(0); // bottom edge %
  const [bgColor, setBgColor] = useState(""); // "" = the style's default backdrop
  const [busy, setBusy] = useState<string | null>(null);
  // Uploads are tracked separately from processing (busy) so an already-added
  // photo can be worked on while another photo is still uploading.
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // Whether the user has started a composite (clicked "Create composite").
  const [composing, setComposing] = useState(false);
  // Cut-outs made *only* for the composite, keyed by slot id. These never touch
  // the photo slots, so building a composite never changes the obverse/reverse
  // thumbnails — those only change when the user clicks "Remove background".
  const [compositeCutouts, setCompositeCutouts] = useState<
    Record<string, string>
  >({});
  const [obvId, setObvId] = useState<string | null>(null);
  const [revId, setRevId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragIndex = useRef<number | null>(null);
  const canvasRef = useRef<CompositeCanvasHandle>(null);
  // The compositeLookKey() the current baked composite was made from. State (not
  // a ref) so the render can compare it to decide if the composite is still up
  // to date; set only in saveComposite, never in an effect.
  const [bakedKey, setBakedKey] = useState("");
  // Free-angle drag-to-spin: live preview angle (plus the cut-out's natural
  // size, so the preview can scale to fit) for the slot being dragged.
  const [spin, setSpin] = useState<{
    id: string;
    angle: number;
    nw: number;
    nh: number;
  } | null>(null);
  const spinRef = useRef<{
    id: string;
    cx: number;
    cy: number;
    start: number;
    startAngle: number;
    nw: number; // natural width of the cut-out being spun
    nh: number; // natural height
  } | null>(null);

  // Wake the (sleep-when-idle) formatter as soon as the upload UI opens, so the
  // cold start overlaps with the user choosing and adding photos instead of
  // landing on their first "Remove background" click. Fire-and-forget.
  useEffect(() => {
    warmFormatter().catch(() => {});
  }, []);

  const urlOf = (path: string) =>
    supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;

  function slotDisplay(s: Slot): string {
    if (!s.cutout) return s.original;
    if (s.bg === "transparent") return s.cutout;
    return s.colored ?? s.cutout;
  }
  const slotUrl = (s: Slot) => urlOf(slotDisplay(s));
  const disabled = busy !== null || uploading;

  function compositeSlots(source: Slot[] = slots): Slot[] {
    if (source.length <= 2) return source;
    const o = source.find((s) => s.id === obvId);
    const r = source.find((s) => s.id === revId);
    return [o, r].filter((s): s is Slot => !!s);
  }

  function resetDerived() {
    setComposite(null);
    setPicking(false);
    setComposing(false);
    setCompositeCutouts({});
    setObvId(null);
    setRevId(null);
  }

  // Shrink big photos in the browser before upload so they transfer fast even
  // on a slow connection. Caps the long edge at 2560px (still high-res —
  // composites render at 2048px) and re-encodes as JPEG. Respects EXIF
  // orientation; falls back to the original on any issue or if it wouldn't get
  // smaller.
  async function downscaleForUpload(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) return file;
    try {
      const bmp = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      const MAX = 2560;
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size <= 1_200_000) {
        bmp.close();
        return file;
      }
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bmp.close();
        return file;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9),
      );
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    } catch {
      return file;
    }
  }

  async function upload(file: File): Promise<string | null> {
    const prepared = await downscaleForUpload(file);
    const ext = prepared.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("item-photos")
      .upload(path, prepared, { contentType: prepared.type, upsert: false });
    if (upErr) {
      setError(upErr.message);
      return null;
    }
    return path;
  }

  async function onAdd(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setNote(null);
    try {
      for (const file of files.slice(0, 8)) {
        const path = await upload(file);
        if (!path) continue;
        setSlots((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            original: path,
            baseCutout: null,
            cutout: null,
            angle: 0,
            bg: "transparent",
            colored: null,
          },
        ]);
      }
      resetDerived();
    } finally {
      setUploading(false);
    }
  }

  function loadCorsImage(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  /**
   * Place a (transparent) cut-out on a solid colour in the browser — no server
   * round-trip. Replaces the old /flatten service call: it draws the cut-out on
   * a colour-filled canvas and uploads the small JPEG straight to storage, so
   * "Remove background" and colour changes don't wait on a second service call.
   * The result is opaque (coin on a solid colour), so it's saved as a JPEG —
   * far smaller than the transparent PNG /flatten returned, so the upload is
   * quick. Returns the stored path, or null (invalid colour, or a load / export
   * / upload failure) — callers fall back to the transparent cut-out.
   */
  async function placeOnColor(
    cutoutPath: string,
    hex: string,
  ): Promise<string | null> {
    const color = normalizeHex(hex);
    if (!color) return null; // e.g. "transparent" — nothing to flatten onto
    try {
      const img = await loadCorsImage(urlOf(cutoutPath));
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return null;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", 0.95),
      );
      if (!blob) return null;
      const path = `${folder}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("item-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      return upErr ? null : path;
    } catch {
      return null;
    }
  }

  async function removeBackground(id: string) {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    setBusy(`bg:${id}`);
    setError(null);
    setNote(null);
    try {
      const t0 = nowMs();
      const cut = await beautifyPhoto(slot.original);
      const t1 = nowMs();
      if (!cut) {
        setNote(
          "That photo's background couldn't be removed — a slabbed coin is kept in its holder. The original will be used.",
        );
        return;
      }
      // Place the cut-out on white by default, tight to the coin (no padding).
      const colored = await placeOnColor(cut, DEFAULT_BG);
      const t2 = nowMs();
      const updated = slots.map((s) =>
        s.id === id
          ? {
              ...s,
              baseCutout: cut,
              cutout: cut,
              angle: 0,
              bg: DEFAULT_BG,
              colored: colored ?? cut,
            }
          : s,
      );
      setSlots(updated);
      // Hidden stopwatch: add ?timing to the page URL to see how long each step
      // took on the live site. Off (and invisible) for everyone else.
      if (
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("timing")
      ) {
        setNote(
          `⏱ total ${((t2 - t0) / 1000).toFixed(1)}s — background removal ${((t1 - t0) / 1000).toFixed(1)}s · place on white ${((t2 - t1) / 1000).toFixed(1)}s`,
        );
      }
      // The live composite canvas reads each coin's cut-out, so it updates on
      // its own — no re-generation needed here.
    } catch {
      setError("Couldn't remove the background — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setSlotBg(id: string, next: string) {
    const slot = slots.find((s) => s.id === id);
    if (!slot?.cutout) return;
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, bg: next } : s)));
    // The composite uses each coin's cut-out on its own backdrop, so a tile's
    // solid-colour choice doesn't change it — leave any existing composite be.
    setBusy(`color:${id}`);
    setError(null);
    try {
      const result = await placeOnColor(slot.cutout, next);
      if (result) {
        setSlots((prev) =>
          prev.map((s) => (s.id === id ? { ...s, bg: next, colored: result } : s)),
        );
      } else {
        setError("Couldn't apply that background colour. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  // Drag-to-spin. `materialize` bakes the chosen angle into the image on
  // release — always re-derived from the un-rotated baseCutout so it never
  // degrades — and is what the composite and the saved listing photo use.
  async function materialize(id: string, angle: number) {
    const slot = slots.find((s) => s.id === id);
    if (!slot?.baseCutout) return;
    const norm = ((Math.round(angle) % 360) + 360) % 360;
    setBusy(`rotate:${id}`);
    setError(null);
    try {
      const rotated =
        norm === 0 ? slot.baseCutout : await rotatePhoto(slot.baseCutout, norm);
      if (!rotated) {
        setError("Couldn't rotate that photo. Please try again.");
        return;
      }
      const colored = await placeOnColor(rotated, slot.bg);
      const updated = slots.map((s) =>
        s.id === id
          ? { ...s, angle: norm, cutout: rotated, colored: colored ?? rotated }
          : s,
      );
      setSlots(updated);
      // The live composite canvas reads each coin's cut-out, so a rotation
      // shows there on its own.
    } finally {
      setBusy(null);
    }
  }

  function onSpinDown(e: RPointerEvent, s: Slot) {
    if (!s.baseCutout || disabled) return;
    e.preventDefault();
    const boxEl = (e.currentTarget as HTMLElement).parentElement;
    const box = boxEl?.getBoundingClientRect();
    if (!box) return;
    const img = boxEl?.querySelector("img");
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    spinRef.current = {
      id: s.id,
      cx,
      cy,
      start: angleAt(cx, cy, e.clientX, e.clientY),
      startAngle: s.angle,
      nw: img?.naturalWidth || 1,
      nh: img?.naturalHeight || 1,
    };
    setSpin({
      id: s.id,
      angle: s.angle,
      nw: img?.naturalWidth || 1,
      nh: img?.naturalHeight || 1,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onSpinMove(e: RPointerEvent) {
    const sp = spinRef.current;
    if (!sp) return;
    const now = angleAt(sp.cx, sp.cy, e.clientX, e.clientY);
    setSpin({
      id: sp.id,
      angle: sp.startAngle + (now - sp.start),
      nw: sp.nw,
      nh: sp.nh,
    });
  }
  function onSpinUp() {
    const sp = spinRef.current;
    spinRef.current = null;
    if (!sp) return;
    const finalAngle = spin && spin.id === sp.id ? spin.angle : sp.startAngle;
    setSpin(null);
    if (Math.round(finalAngle) !== Math.round(sp.startAngle))
      materialize(sp.id, finalAngle);
  }

  // Live rotation preview: rotate in place around the centre at the current
  // size — no scaling. The coin just spins; its size stays put.
  function spinStyle(s: Slot): CSSProperties | undefined {
    if (!spin || spin.id !== s.id) return undefined;
    return { transform: `rotate(${spin.angle}deg)` };
  }

  function removeSlot(id: string) {
    const slot = slots.find((s) => s.id === id);
    if (slot?.original)
      supabase.storage.from("item-photos").remove([slot.original]);
    setSlots((prev) => prev.filter((s) => s.id !== id));
    resetDerived();
  }

  /** Move a photo to a new position (drag-reorder). The first one is primary. */
  function reorder(from: number | null, to: number) {
    if (from === null || from === to) return;
    setSlots((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length)
        return prev;
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  }

  /**
   * Make the transparent cut-outs the composite draws, WITHOUT touching the
   * photo slots — so the obverse/reverse thumbnails are never modified. A coin
   * the user already cut out (its own "Remove background") is reused as-is. The
   * composite only ever shows cut-outs, never the original background, so if a
   * coin can't be cut out we surface an error and don't open the composite.
   * Sequential, to be gentle on the single-worker formatter.
   */
  async function makeCompositeCutouts() {
    const need = compositeSlots().filter(
      (s) => !s.cutout && !compositeCutouts[s.id],
    );
    if (!need.length) return;
    setBusy("compose");
    setError(null);
    setNote(null);
    try {
      let anyFail = false;
      for (const s of need) {
        const cut = await beautifyPhoto(s.original);
        if (cut) setCompositeCutouts((prev) => ({ ...prev, [s.id]: cut }));
        else anyFail = true;
      }
      if (anyFail) {
        // The composite must never show an original background, so don't open
        // it — tell the user and let them retry (or keep a slab in its holder).
        setError(
          "A coin's background couldn't be removed, so the composite can't be built. If it's a slabbed coin, keep it in its holder; otherwise try again.",
        );
        setComposing(false);
      }
    } finally {
      setBusy(null);
    }
  }

  /**
   * Enter composite mode. For >2 photos, first pick which two sides. Building
   * the composite cuts the coins out for the composite only; it never changes
   * the obverse/reverse photos themselves.
   */
  function onMainCompose() {
    if (slots.length > 2 && (!obvId || !revId)) {
      if (!obvId) setObvId(slots[0].id);
      if (!revId) setRevId(slots[1].id);
      setPicking(true);
      return;
    }
    setComposing(true);
    void makeCompositeCutouts();
  }

  /** Bake the live canvas at full resolution and store it as the composite. */
  async function saveComposite(): Promise<string | null> {
    setBusy("compose");
    setError(null);
    setNote(null);
    try {
      const blob = await canvasRef.current?.export2048();
      if (!blob) {
        setError("Couldn't build the composite. Please try again.");
        return null;
      }
      const path = `${folder}/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage
        .from("item-photos")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (error) {
        setError(error.message);
        return null;
      }
      setComposite(path);
      // Remember the look this copy was baked from, so we know when it's stale.
      setBakedKey(compositeLookKey());
      return path;
    } finally {
      setBusy(null);
    }
  }

  // The "make this the main photo" checkbox also bakes the composite (there's no
  // separate Save button): ticking it exports and uploads the composite once.
  // A signature of everything that affects how the composite looks. The baked
  // copy is only valid while this matches what it was baked from — so changing
  // the background or any adjustment marks it stale (no stale submit), without
  // needing an effect that clears state.
  function compositeLookKey() {
    return [
      bg,
      bgColor,
      gap,
      padding,
      reflection,
      floorGlow,
      floorShadow,
      reflLen,
      reflStr,
      reflSpread,
      reflDepth,
      reflSkew,
      cropTop,
      cropBottom,
    ].join("|");
  }

  async function toggleCompositePrimary(checked: boolean) {
    setCompositePrimary(checked);
    // (Re)bake if we don't have an up-to-date composite for the current look.
    const fresh = !!composite && bakedKey === compositeLookKey();
    if (checked && !fresh) {
      const path = await saveComposite();
      if (!path) setCompositePrimary(false); // bake failed — untick
    }
  }

  function chooseBg(next: "shadow" | "plain") {
    setBg(next);
    // The studio "shadow" look reads best with a reflection; the plain
    // composite never uses one.
    setReflection(next === "shadow");
  }

  // Adjustments update state only — the canvas re-renders live, no server call.
  function commitAdjust(over: Partial<Adjust>) {
    if (over.reflection !== undefined) setReflection(over.reflection);
    if (over.floorGlow !== undefined) setFloorGlow(over.floorGlow);
    if (over.floorShadow !== undefined) setFloorShadow(over.floorShadow);
    if (over.gap !== undefined) setGap(over.gap);
    if (over.padding !== undefined) setPadding(over.padding);
  }

  /** Put every composite adjustment back to its default. */
  function resetAdjust() {
    setReflection(bg === "shadow");
    setFloorGlow(false);
    setFloorShadow(false);
    setGap(6);
    setPadding(14);
    setReflLen(42);
    setReflStr(26);
    setReflSpread(1);
    setReflDepth(1);
    setReflSkew(0);
    setCropTop(0);
    setCropBottom(0);
    setBgColor("");
  }

  const photoPaths = slots.map((s) => slotDisplay(s));
  // A baked composite is only valid while its look hasn't changed since it was
  // saved — changing the background or any adjustment marks it stale.
  const compositeFresh = !!composite && bakedKey === compositeLookKey();
  // The composite is included (as the main photo) only when the user ticks the
  // "make it the main photo" box (which bakes it) and it's still up to date.
  // Otherwise just the uploaded photos are submitted.
  const submitPhotos: string[] =
    compositePrimary && compositeFresh && composite
      ? [composite, ...photoPaths]
      : photoPaths;

  // Empty state: labelled Obverse/Reverse boxes for the first two photos.
  const placeholders = slots.length < 2 ? SLOT_LABELS.slice(slots.length) : [];

  // The two coins that go into the composite. Each must have a cut-out — the
  // user's own, or the composite-only one made on "Create composite" — before
  // the composite opens, so the original background is never shown.
  const compositeCoins = compositeSlots();
  const coinCutout = (s: Slot): string | null => s.cutout ?? compositeCutouts[s.id] ?? null;
  const compositeReady =
    composing &&
    !picking &&
    slots.length > 1 &&
    compositeCoins.length >= 2 &&
    compositeCoins.every((s) => !!coinCutout(s));

  // Plain-English summary of the reflection's perspective (set by the drag handles).
  const perspParts: string[] = [];
  if (Math.abs(reflSpread - 1) >= 0.005 || Math.abs(reflDepth - 1) >= 0.005)
    perspParts.push(
      `width ×${reflSpread.toFixed(2)}, height ×${reflDepth.toFixed(2)}`,
    );
  if (Math.abs(reflSkew) >= 0.005)
    perspParts.push(
      `light ${reflSkew > 0 ? "→ right" : "← left"} ${Math.round(
        Math.abs(reflSkew) * 100,
      )}%`,
    );
  const perspLabel = perspParts.length ? perspParts.join(" · ") : "straight down";

  /** Per-photo background options: None + Original (corner colour) + swatches + hex. */
  function bgOptions(s: Slot) {
    const isColor = (c: string) => s.bg.toLowerCase() === c.toLowerCase();
    return (
      <div className="w-[212px] space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Background
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSlotBg(s.id, c)}
              disabled={disabled}
              aria-label={`Background ${c}`}
              className={
                "h-5 w-5 rounded-full border " +
                (isColor(c) ? "ring-2 ring-ring ring-offset-1" : "")
              }
              style={{ backgroundColor: c }}
            />
          ))}
          <HexColorInput
            key={s.bg}
            value={s.bg}
            onApply={(hex) => setSlotBg(s.id, hex)}
            disabled={disabled}
          />
        </div>
        {busy === `color:${s.id}` && (
          <div className="text-[10px] text-muted-foreground">Applying…</div>
        )}
      </div>
    );
  }

  function roleRow(
    selectedId: string | null,
    otherId: string | null,
    onPick: (id: string) => void,
  ) {
    return (
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => {
          const selected = s.id === selectedId;
          const isOther = s.id === otherId;
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled || isOther}
              onClick={() => onPick(s.id)}
              className={
                "h-16 w-16 overflow-hidden rounded-md border " +
                (selected ? "ring-2 ring-ring ring-offset-1 " : "") +
                (isOther ? "opacity-30" : "hover:opacity-90")
              }
              aria-label={selected ? "Selected" : "Select this photo"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slotUrl(s)}
                alt=""
                className="h-full w-full bg-muted object-contain"
              />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {submitPhotos.map((p, i) => (
        <input key={`${p}-${i}`} type="hidden" name="photos" value={p} />
      ))}

      <div className="space-y-4">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {slots.map((s, i) => (
              <div
                key={s.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  reorder(dragIndex.current, i);
                  dragIndex.current = null;
                }}
                className="space-y-1.5"
              >
                <div className="relative h-[212px] w-[212px]">
                  <div className="h-[212px] w-[212px] overflow-hidden rounded-md border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        spin && spin.id === s.id && s.baseCutout
                          ? urlOf(s.baseCutout)
                          : slotUrl(s)
                      }
                      alt=""
                      draggable={false}
                      onClick={() => setZoom(slotUrl(s))}
                      style={spinStyle(s)}
                      className="h-[212px] w-[212px] cursor-zoom-in object-contain"
                    />
                  </div>
                  <span
                    draggable={!disabled}
                    onDragStart={(e) => {
                      dragIndex.current = i;
                      const card = cardRefs.current[i];
                      if (card) e.dataTransfer.setDragImage(card, 20, 20);
                    }}
                    onDragEnd={() => {
                      dragIndex.current = null;
                    }}
                    title="Drag to reorder"
                    className="absolute left-1 top-1 cursor-grab select-none rounded bg-background/80 px-1.5 text-sm leading-5 shadow-sm active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                  {i === 0 && (!composite || !compositePrimary) && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                      Primary
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSlot(s.id)}
                    disabled={disabled}
                    className="absolute -right-2 -top-2 rounded-full border bg-background px-1.5 text-xs leading-5 hover:bg-muted"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                  {s.cutout && (
                    <span
                      onPointerDown={(e) => onSpinDown(e, s)}
                      onPointerMove={onSpinMove}
                      onPointerUp={onSpinUp}
                      title="Drag to rotate"
                      aria-label="Drag to rotate"
                      className="absolute bottom-1 right-1 cursor-grab touch-none select-none rounded-full border bg-background/90 px-1.5 text-sm leading-6 shadow-sm active:cursor-grabbing"
                    >
                      {busy === `rotate:${s.id}` ? "…" : "↻"}
                    </span>
                  )}
                </div>
                {!s.cutout ? (
                  <button
                    type="button"
                    onClick={() => removeBackground(s.id)}
                    disabled={busy !== null}
                    className="w-[212px] rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {busy === `bg:${s.id}` ? "Removing…" : "Remove background"}
                  </button>
                ) : (
                  bgOptions(s)
                )}
              </div>
            ))}

            {placeholders.map((label) => (
              <label
                key={label}
                className={
                  "flex h-[212px] w-[212px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:bg-muted/30 " +
                  (disabled ? "pointer-events-none opacity-60" : "")
                }
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-2xl leading-none">
                  +
                </span>
                <span className="text-sm font-medium">
                  {busy === "upload" ? "Uploading…" : label}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onAdd}
                  disabled={disabled}
                />
              </label>
            ))}
            {slots.length >= 2 && (
              <label
                className={
                  "flex h-[212px] w-[212px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:bg-muted/30 " +
                  (disabled ? "pointer-events-none opacity-60" : "")
                }
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-2xl leading-none">
                  +
                </span>
                <span className="text-sm font-medium">
                  {busy === "upload" ? "Uploading…" : "Add photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onAdd}
                  disabled={disabled}
                />
              </label>
            )}
          </div>

          {slots.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Drag <span aria-hidden="true">⠿</span> to reorder — the first photo
              (<span className="font-medium">Primary</span>) is your
              listing&apos;s main image. After removing a background, drag{" "}
              <span aria-hidden="true">↻</span> to spin a photo to any angle.
            </p>
          )}

          {slots.length > 1 && (
            <div className="space-y-3 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Composite (optional)
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">Background</span>
                <div className="inline-flex overflow-hidden rounded-md border text-sm">
                  <button
                    type="button"
                    onClick={() => chooseBg("plain")}
                    disabled={disabled}
                    className={
                      "px-3 py-1.5 font-medium " +
                      (bg === "plain"
                        ? "bg-foreground text-background"
                        : "hover:bg-muted")
                    }
                  >
                    Plain
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseBg("shadow")}
                    disabled={disabled}
                    className={
                      "border-l px-3 py-1.5 font-medium " +
                      (bg === "shadow"
                        ? "bg-foreground text-background"
                        : "hover:bg-muted")
                    }
                  >
                    Shadow
                  </button>
                </div>

              </div>

              {picking ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="text-sm font-medium">
                    Which two sides go in the composite?
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Front (obverse)
                    </div>
                    {roleRow(obvId, revId, setObvId)}
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Back (reverse)
                    </div>
                    {roleRow(revId, obvId, setRevId)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPicking(false);
                        setComposing(true);
                        void makeCompositeCutouts();
                      }}
                      disabled={disabled || !obvId || !revId || obvId === revId}
                      className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                    >
                      {busy === "compose" ? "Preparing…" : "Continue"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPicking(false)}
                      disabled={disabled}
                      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : composing && !compositeReady ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground" />
                  Preparing the composite — cutting out the coins…
                </div>
              ) : !compositeReady ? (
                <button
                  type="button"
                  onClick={onMainCompose}
                  disabled={disabled}
                  className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                >
                  Create composite
                </button>
              ) : null}
            </div>
          )}
        </div>

        {compositeReady && (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* Live composite — renders in the browser, updates instantly */}
            <div className="space-y-2">
              <div className="w-full max-w-xs">
                <CompositeCanvas
                  ref={canvasRef}
                  coinUrls={compositeCoins.map((s) => urlOf(coinCutout(s)!))}
                  background={bg}
                  reflection={reflection}
                  floorGlow={floorGlow}
                  floorShadow={floorShadow}
                  gap={gap}
                  padding={padding}
                  reflLen={reflLen}
                  reflStr={reflStr}
                  reflSpread={reflSpread}
                  reflDepth={reflDepth}
                  reflSkew={reflSkew}
                  cropTop={cropTop}
                  cropBottom={cropBottom}
                  bgColor={bgColor}
                  onPerspective={({ spread, depth, skew }) => {
                    setReflSpread(spread);
                    setReflDepth(depth);
                    setReflSkew(skew);
                  }}
                />
              </div>
              <label className="flex max-w-xs items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={compositePrimary && compositeFresh}
                  onChange={(e) => toggleCompositePrimary(e.target.checked)}
                  disabled={busy === "compose"}
                  className="mt-0.5"
                />
                <span>
                  Use the composite as the listing&apos;s main photo — your
                  uploaded photos are kept alongside it.
                  {busy === "compose" && (
                    <span className="text-foreground"> Saving…</span>
                  )}
                </span>
              </label>
            </div>

            {/* Plain composite: just a background colour (it auto-renders). */}
            {bg === "plain" && (
              <div className="space-y-2 sm:w-56">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Background
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {["#ffffff", "#000000", "#f4f4f5", "#1e293b", "#3f3f46"].map(
                    (c) => {
                      const active =
                        (bgColor || "#ffffff").toLowerCase() === c.toLowerCase();
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setBgColor(c)}
                          aria-label={`Background ${c}`}
                          className={
                            "h-7 w-7 rounded-full border " +
                            (active
                              ? "ring-2 ring-ring ring-offset-1"
                              : "hover:opacity-80")
                          }
                          style={{ backgroundColor: c }}
                        />
                      );
                    },
                  )}
                  <label
                    className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs hover:bg-muted"
                    title="Pick any colour"
                  >
                    <input
                      type="color"
                      value={bgColor || "#ffffff"}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                    />
                    Custom
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Defaults to white — pick a colour and the composite updates
                  instantly.
                </p>
              </div>
            )}

            {/* Studio adjustments — Shadow only; the plain composite
                auto-renders in a fixed format (sample composite.jpg). */}
            {bg === "shadow" && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Adjust — changes show instantly
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* Left column: reflection & staging */}
                <div className="space-y-3 sm:w-48">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={reflection}
                      disabled={disabled}
                      onChange={(e) =>
                        commitAdjust({ reflection: e.target.checked })
                      }
                      className="h-4 w-4 accent-foreground"
                    />
                    Mirror reflection
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={floorGlow}
                      disabled={disabled}
                      onChange={(e) =>
                        commitAdjust({ floorGlow: e.target.checked })
                      }
                      className="h-4 w-4 accent-foreground"
                    />
                    Floor glow
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={floorShadow}
                      disabled={disabled}
                      onChange={(e) =>
                        commitAdjust({ floorShadow: e.target.checked })
                      }
                      className="h-4 w-4 accent-foreground"
                    />
                    Floor shadow
                  </label>

                  {/* Reflection shaping — only meaningful when the reflection is on */}
                  {reflection && (
                    <div className="space-y-3 rounded-md bg-muted/40 p-2">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Reflection length</span>
                          <span className="tabular-nums">
                            {reflLen}% of the coin
                          </span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={reflLen}
                          disabled={disabled}
                          onChange={(e) => setReflLen(+e.target.value)}
                          className="mt-1 w-full accent-foreground"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Reflection strength</span>
                          <span className="tabular-nums">{reflStr}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={80}
                          value={reflStr}
                          disabled={disabled}
                          onChange={(e) => setReflStr(+e.target.value)}
                          className="mt-1 w-full accent-foreground"
                        />
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="flex-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Perspective:
                          </span>{" "}
                          {perspLabel}
                          <span className="mt-0.5 block text-[11px]">
                            Drag the ● dots on the photo to shape the
                            reflection, the ◆ for light direction.
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setReflSpread(1);
                            setReflDepth(1);
                            setReflSkew(0);
                          }}
                          className="rounded border px-2 py-1 text-xs hover:bg-muted"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column: framing & finish */}
                <div className="space-y-3 sm:w-48">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Gap (obverse ↔ reverse)</span>
                      <span className="tabular-nums">{gap}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      value={gap}
                      disabled={disabled}
                      onChange={(e) => setGap(+e.target.value)}
                      className="mt-1 w-full accent-foreground"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Padding (less = bigger)</span>
                      <span className="tabular-nums">{padding}%</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={40}
                      value={padding}
                      disabled={disabled}
                      onChange={(e) => setPadding(+e.target.value)}
                      className="mt-1 w-full accent-foreground"
                    />
                  </div>

                  {/* Crop or extend the frame edges — nothing is resized */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      Crop or extend the edges
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Nothing is resized — trim (−) or add space (+).
                    </p>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Top edge</span>
                      <span className="tabular-nums">
                        {cropTop === 0
                          ? "—"
                          : `${cropTop > 0 ? "+" : ""}${cropTop}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      value={cropTop}
                      disabled={disabled}
                      onChange={(e) => setCropTop(+e.target.value)}
                      className="mt-1 w-full accent-foreground"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Bottom edge</span>
                      <span className="tabular-nums">
                        {cropBottom === 0
                          ? "—"
                          : `${cropBottom > 0 ? "+" : ""}${cropBottom}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      value={cropBottom}
                      disabled={disabled}
                      onChange={(e) => setCropBottom(+e.target.value)}
                      className="mt-1 w-full accent-foreground"
                    />
                  </div>

                  {/* Background colour — overrides the style's own backdrop */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Background colour
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={
                          bgColor || (bg === "shadow" ? "#222224" : "#ffffff")
                        }
                        disabled={disabled}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                        title="Pick a background colour"
                      />
                      {bgColor && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setBgColor("")}
                          className="rounded border px-2 py-1 text-xs hover:bg-muted"
                        >
                          Default
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={resetAdjust}
                    className="mt-1 w-full rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    ↺ Reset adjustments
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
