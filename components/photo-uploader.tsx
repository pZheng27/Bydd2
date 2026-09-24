"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { beautifyPhoto, composePhotos } from "@/app/photo-actions";

type Slot = {
  id: string;
  original: string;
  cutout: string | null; // transparent cut-out, after "Remove background"
  bg: "transparent" | string; // "transparent" or a hex colour, once cut out
  colored: string | null; // the cut-out placed on `bg` (a hex colour)
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
            cutout: null,
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
      // Default to a white background so the removal is clearly visible.
      const colored = await composePhotos([cut], DEFAULT_BG);
      setSlots((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                cutout: cut,
                bg: colored ? DEFAULT_BG : "transparent",
                colored: colored ?? null,
              }
            : s,
        ),
      );
      setComposite(null);
    } finally {
      setBusy(null);
    }
  }

  async function setSlotBg(id: string, next: "transparent" | string) {
    const slot = slots.find((s) => s.id === id);
    if (!slot?.cutout) return;
    setComposite(null);
    if (next === "transparent") {
      setSlots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, bg: "transparent", colored: null } : s)),
      );
      return;
    }
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, bg: next } : s)));
    setBusy(`color:${id}`);
    setError(null);
    try {
      const result = await composePhotos([slot.cutout], next);
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

  function removeSlot(id: string) {
    const slot = slots.find((s) => s.id === id);
    if (slot?.original)
      supabase.storage.from("item-photos").remove([slot.original]);
    setSlots((prev) => prev.filter((s) => s.id !== id));
    resetDerived();
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
      <div className="w-40 space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Background
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSlotBg(s.id, "transparent")}
            disabled={disabled}
            className={
              "rounded-full border px-2 py-0.5 text-[10px] font-medium " +
              (s.bg === "transparent"
                ? "bg-foreground text-background"
                : "hover:bg-muted")
            }
          >
            None
          </button>
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
            value={s.bg === "transparent" ? DEFAULT_BG : s.bg}
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
            {slots.map((s) => (
              <div key={s.id} className="space-y-1.5">
                <div className="relative h-40 w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slotUrl(s)}
                    alt=""
                    className="h-40 w-40 rounded-md border bg-muted object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => removeSlot(s.id)}
                    disabled={disabled}
                    className="absolute -right-2 -top-2 rounded-full border bg-background px-1.5 text-xs leading-5 hover:bg-muted"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
                {!s.cutout ? (
                  <button
                    type="button"
                    onClick={() => removeBackground(s.id)}
                    disabled={disabled}
                    className="w-40 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {busy === `bg:${s.id}` ? "Removing…" : "Remove background"}
                  </button>
                ) : (
                  bgOptions(s)
                )}
              </div>
            ))}

            <label className="flex h-40 w-40 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground hover:bg-muted">
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
                className="aspect-square w-full rounded-lg border bg-muted object-contain"
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
    </div>
  );
}
