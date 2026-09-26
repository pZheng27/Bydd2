"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as RPointerEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  beautifyPhoto,
  composePhotos,
  flattenPhoto,
  rotatePhoto,
} from "@/app/photo-actions";
import { Lightbox } from "@/components/lightbox";

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

const SWATCHES = ["#ffffff", "#f4f4f5", "#111114", "#1e293b", "#3f3f46"];

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
  const [bg, setBg] = useState<"shadow" | "plain">("shadow");
  const [color, setColor] = useState("#ffffff");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [obvId, setObvId] = useState<string | null>(null);
  const [revId, setRevId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragIndex = useRef<number | null>(null);
  // Free-angle drag-to-spin: live preview angle for the slot being dragged.
  const [spin, setSpin] = useState<{ id: string; angle: number } | null>(null);
  const spinRef = useRef<{
    id: string;
    cx: number;
    cy: number;
    start: number;
    startAngle: number;
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

  function compositeSlots(): Slot[] {
    if (slots.length <= 2) return slots;
    const o = slots.find((s) => s.id === obvId);
    const r = slots.find((s) => s.id === revId);
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
      setSlots((prev) =>
        prev.map((s) =>
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
        ),
      );
      setComposite(null);
    } finally {
      setBusy(null);
    }
  }

  async function setSlotBg(id: string, next: string) {
    const slot = slots.find((s) => s.id === id);
    if (!slot?.cutout) return;
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, bg: next } : s)));
    setComposite(null);
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
      setSlots((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, angle: norm, cutout: rotated, colored: colored ?? rotated }
            : s,
        ),
      );
      setComposite(null);
    } finally {
      setBusy(null);
    }
  }

  function onSpinDown(e: RPointerEvent, s: Slot) {
    if (!s.baseCutout || disabled) return;
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if (!box) return;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    spinRef.current = {
      id: s.id,
      cx,
      cy,
      start: angleAt(cx, cy, e.clientX, e.clientY),
      startAngle: s.angle,
    };
    setSpin({ id: s.id, angle: s.angle });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onSpinMove(e: RPointerEvent) {
    const sp = spinRef.current;
    if (!sp) return;
    const now = angleAt(sp.cx, sp.cy, e.clientX, e.clientY);
    setSpin({ id: sp.id, angle: sp.startAngle + (now - sp.start) });
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

  async function makeComposite(nextBg?: "shadow" | "plain", nextColor?: string) {
    const paths = compositeSlots().map((s) => s.cutout ?? s.original);
    if (paths.length === 0) return;
    setBusy("compose");
    setError(null);
    setNote(null);
    try {
      const useBg = nextBg ?? bg;
      const useColor = nextColor ?? color;
      const result = await composePhotos(
        paths,
        useBg === "shadow" ? "shadow" : useColor,
      );
      if (result) {
        setComposite(result);
      } else {
        setComposite(null);
        setError("Couldn't process the photo(s). Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  function onMainCompose() {
    if (slots.length > 2) {
      if (!obvId) setObvId(slots[0].id);
      if (!revId) setRevId(slots[1].id);
      setPicking(true);
    } else {
      makeComposite();
    }
  }

  function chooseBg(next: "shadow" | "plain") {
    setBg(next);
    if (composite) makeComposite(next, color);
  }
  function chooseColor(next: string) {
    setColor(next);
    if (composite && bg === "plain") makeComposite("plain", next);
  }

  const photoPaths = slots.map((s) => slotDisplay(s));
  const submitPhotos: string[] = composite
    ? [composite, ...photoPaths]
    : photoPaths;

  const composeLabel =
    busy === "compose"
      ? "Working…"
      : composite
        ? "Update composite"
        : slots.length > 2
          ? "Create composite…"
          : slots.length > 1
            ? "Create composite"
            : "Apply background";

  /** Per-photo background options: None + Original (corner colour) + swatches + hex. */
  function bgOptions(s: Slot) {
    const isColor = (c: string) => s.bg.toLowerCase() === c.toLowerCase();
    return (
      <div className="w-48 space-y-1">
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

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="space-y-4 lg:flex-1">
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
                <div className="relative h-48 w-48">
                  <div className="h-48 w-48 overflow-hidden rounded-md border bg-muted">
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
                      style={
                        spin && spin.id === s.id
                          ? { transform: `rotate(${spin.angle}deg)` }
                          : undefined
                      }
                      className="h-48 w-48 cursor-zoom-in object-contain"
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
                  {i === 0 && !composite && (
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
                    className="w-48 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {busy === `bg:${s.id}` ? "Removing…" : "Remove background"}
                  </button>
                ) : (
                  bgOptions(s)
                )}
              </div>
            ))}

            <label className="flex h-48 w-48 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground hover:bg-muted">
              {busy === "upload" ? "Uploading…" : "+ Add photo"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onAdd}
                disabled={disabled}
              />
            </label>
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

                {bg === "plain" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => chooseColor(c)}
                        disabled={disabled}
                        aria-label={`Background ${c}`}
                        className={
                          "h-6 w-6 rounded-full border " +
                          (color.toLowerCase() === c.toLowerCase()
                            ? "ring-2 ring-ring ring-offset-1"
                            : "")
                        }
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <HexColorInput
                      key={color}
                      value={color}
                      onApply={chooseColor}
                      disabled={disabled}
                    />
                  </div>
                )}
              </div>

              {!picking && (
                <button
                  type="button"
                  onClick={onMainCompose}
                  disabled={disabled}
                  className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                >
                  {composeLabel}
                </button>
              )}

              {picking && (
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
                        makeComposite();
                      }}
                      disabled={disabled || !obvId || !revId || obvId === revId}
                      className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                    >
                      {busy === "compose" ? "Working…" : "Create composite"}
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
              )}
            </div>
          )}
        </div>

        {composite && (
          <div className="space-y-1 lg:w-72 lg:shrink-0">
            <div className="w-full max-w-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urlOf(composite)}
                alt="Composite"
                onClick={() => setZoom(urlOf(composite))}
                className="aspect-square w-full cursor-zoom-in rounded-lg border bg-muted object-contain"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This is your listing&apos;s main photo. Your uploaded photos are
              kept alongside it.
            </p>
          </div>
        )}
      </div>

      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
