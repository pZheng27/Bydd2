"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  beautifyPhoto,
  flattenPhoto,
  rotatePhoto,
} from "@/app/photo-actions";
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
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [obvId, setObvId] = useState<string | null>(null);
  const [revId, setRevId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragIndex = useRef<number | null>(null);
  const canvasRef = useRef<CompositeCanvasHandle>(null);
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

  const urlOf = (path: string) =>
    supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;

  function slotDisplay(s: Slot): string {
    if (!s.cutout) return s.original;
    if (s.bg === "transparent") return s.cutout;
    return s.colored ?? s.cutout;
  }
  const slotUrl = (s: Slot) => urlOf(slotDisplay(s));
  const disabled = busy !== null;

  function compositeSlots(source: Slot[] = slots): Slot[] {
    if (source.length <= 2) return source;
    const o = source.find((s) => s.id === obvId);
    const r = source.find((s) => s.id === revId);
    return [o, r].filter((s): s is Slot => !!s);
  }

  function resetDerived() {
    setComposite(null);
    setPicking(false);
    setObvId(null);
    setRevId(null);
  }

  async function upload(file: File): Promise<string | null> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("item-photos")
      .upload(path, file, { contentType: file.type, upsert: false });
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
    setBusy("upload");
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
      setBusy(null);
    }
  }

  async function removeBackground(id: string) {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    setBusy(`bg:${id}`);
    setError(null);
    setNote(null);
    try {
      const cut = await beautifyPhoto(slot.original);
      if (!cut) {
        setNote(
          "That photo's background couldn't be removed — a slabbed coin is kept in its holder. The original will be used.",
        );
        return;
      }
      // Place the cut-out on white by default, tight to the coin (no padding).
      const colored = await flattenPhoto(cut, DEFAULT_BG);
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
      // The live composite canvas reads each coin's cut-out, so it updates on
      // its own — no re-generation needed here.
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
      const result = await flattenPhoto(slot.cutout, next);
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
      const colored = await flattenPhoto(rotated, slot.bg);
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

  // Live rotation preview: rotate around centre AND scale down so the whole
  // cut-out stays inside its square tile (no clipped rim), matching what the
  // server returns after it re-crops the rotated coin — so nothing jumps when
  // the drag is released.
  function spinStyle(s: Slot): CSSProperties | undefined {
    if (!spin || spin.id !== s.id) return undefined;
    const rad = (spin.angle * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const si = Math.abs(Math.sin(rad));
    const long = Math.max(spin.nw, spin.nh);
    const w = spin.nw / long; // content size within the tile (0..1)
    const h = spin.nh / long;
    const k = 1 / Math.max(w * c + h * si, w * si + h * c);
    return { transform: `rotate(${spin.angle}deg) scale(${k})` };
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

  // Cut out the composite coins (the live canvas needs transparent cut-outs).
  // Runs in parallel and writes state once, so nothing races.
  async function ensureComposite() {
    const need = compositeSlots().filter((s) => !s.cutout);
    if (!need.length) return;
    setBusy("compose");
    setError(null);
    setNote(null);
    try {
      const results = await Promise.all(
        need.map(async (s) => {
          const cut = await beautifyPhoto(s.original);
          const colored = cut ? await flattenPhoto(cut, DEFAULT_BG) : null;
          return { id: s.id, cut, colored };
        }),
      );
      if (!results.some((r) => r.cut))
        setError(
          "Those photos' backgrounds couldn't be removed — a slabbed coin is kept in its holder.",
        );
      setSlots((prev) =>
        prev.map((s) => {
          const r = results.find((x) => x.id === s.id);
          return r?.cut
            ? {
                ...s,
                baseCutout: r.cut,
                cutout: r.cut,
                angle: 0,
                bg: DEFAULT_BG,
                colored: r.colored ?? r.cut,
              }
            : s;
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  /** Enter composite mode: pick the two sides (>2 photos), then cut them out. */
  async function onMainCompose() {
    if (slots.length > 2 && (!obvId || !revId)) {
      if (!obvId) setObvId(slots[0].id);
      if (!revId) setRevId(slots[1].id);
      setPicking(true);
      return;
    }
    await ensureComposite();
  }

  /** Bake the live canvas at full resolution and store it as the composite. */
  async function saveComposite() {
    setBusy("compose");
    setError(null);
    setNote(null);
    try {
      const blob = await canvasRef.current?.export2048();
      if (!blob) {
        setError("Couldn't build the composite. Please try again.");
        return;
      }
      const path = `${folder}/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage
        .from("item-photos")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (error) {
        setError(error.message);
        return;
      }
      setComposite(path);
    } finally {
      setBusy(null);
    }
  }

  function chooseBg(next: "shadow" | "plain") {
    setBg(next);
    // The studio "shadow" look reads best with a reflection, so turn it on by
    // default whenever it's chosen.
    if (next === "shadow") setReflection(true);
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
  const submitPhotos: string[] = composite
    ? compositePrimary
      ? [composite, ...photoPaths]
      : [...photoPaths, composite]
    : photoPaths;

  // Empty state: labelled Obverse/Reverse boxes for the first two photos.
  const placeholders = slots.length < 2 ? SLOT_LABELS.slice(slots.length) : [];

  // The coins that go into the composite, and whether they're cut out (the live
  // canvas needs transparent cut-outs to draw).
  const compositeCoins = compositeSlots();
  const compositeReady =
    slots.length > 1 &&
    !picking &&
    compositeCoins.length >= 2 &&
    compositeCoins.every((s) => !!s.cutout);

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
                    disabled={disabled}
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
                      onClick={async () => {
                        setPicking(false);
                        await ensureComposite();
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
              ) : !compositeReady ? (
                <button
                  type="button"
                  onClick={onMainCompose}
                  disabled={disabled}
                  className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                >
                  {busy === "compose" ? "Preparing…" : "Create composite"}
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
                  coinUrls={compositeCoins.map((s) => urlOf(s.cutout as string))}
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
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveComposite}
                  disabled={disabled}
                  className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                >
                  {busy === "compose"
                    ? "Saving…"
                    : composite
                      ? "Update composite"
                      : "Save composite"}
                </button>
                {composite && (
                  <span className="text-xs text-muted-foreground">Saved ✓</span>
                )}
              </div>
              {composite && (
                <label className="flex max-w-xs items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={compositePrimary}
                    onChange={(e) => setCompositePrimary(e.target.checked)}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <span>
                    Use the composite as the listing&apos;s main photo.{" "}
                    {compositePrimary
                      ? "Your uploaded photos are kept alongside it."
                      : "Your first uploaded photo will be the main image instead."}
                  </span>
                </label>
              )}
            </div>

            {/* Studio adjustments — to the right of the composite, live */}
            <div className="space-y-3 sm:w-56">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Adjust — changes show instantly
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reflection}
                  disabled={disabled}
                  onChange={(e) => commitAdjust({ reflection: e.target.checked })}
                  className="h-4 w-4 accent-foreground"
                />
                Mirror reflection
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={floorGlow}
                  disabled={disabled}
                  onChange={(e) => commitAdjust({ floorGlow: e.target.checked })}
                  className="h-4 w-4 accent-foreground"
                />
                Floor glow
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={floorShadow}
                  disabled={disabled}
                  onChange={(e) => commitAdjust({ floorShadow: e.target.checked })}
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
                      <span className="tabular-nums">{reflLen}% of the coin</span>
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
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Perspective width</span>
                      <span className="tabular-nums">×{reflSpread.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      value={reflSpread}
                      disabled={disabled}
                      onChange={(e) => setReflSpread(+e.target.value)}
                      className="mt-1 w-full accent-foreground"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Perspective depth</span>
                      <span className="tabular-nums">×{reflDepth.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.3}
                      max={1.6}
                      step={0.05}
                      value={reflDepth}
                      disabled={disabled}
                      onChange={(e) => setReflDepth(+e.target.value)}
                      className="mt-1 w-full accent-foreground"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Light direction</span>
                      <span className="tabular-nums">
                        {Math.abs(reflSkew) < 0.005
                          ? "centred"
                          : `${reflSkew > 0 ? "right" : "left"} ${Math.round(
                              Math.abs(reflSkew) * 100,
                            )}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-1.5}
                      max={1.5}
                      step={0.05}
                      value={reflSkew}
                      disabled={disabled}
                      onChange={(e) => setReflSkew(+e.target.value)}
                      className="mt-1 w-full accent-foreground"
                    />
                  </div>
                </div>
              )}

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
                    {cropTop === 0 ? "—" : `${cropTop > 0 ? "+" : ""}${cropTop}%`}
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
                    value={bgColor || (bg === "shadow" ? "#222224" : "#ffffff")}
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
        )}
      </div>

      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
