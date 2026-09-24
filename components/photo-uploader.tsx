"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { beautifyPhoto, composePhotos } from "@/app/photo-actions";

type Slot = { id: string; original: string; cutout: string | null };

const SWATCHES = ["#ffffff", "#f4f4f5", "#111114", "#1e293b", "#3f3f46"];

/**
 * Photo uploader with an in-form beautify + composite flow.
 *
 * Add any number of photos; each has its own "Beautify" (background removal).
 * Pick a background — Plain (a solid colour, swatches + picker) or Shadow (the
 * studio look) — and "Create composite" combines an obverse + reverse into one
 * product image shown to the right. With more than two photos, a chooser asks
 * which photo is the front (obverse) and which is the back (reverse). A single
 * photo (e.g. an already-composited shot) is processed on its own.
 *
 * On submit: when a composite exists it is the listing's main photo followed by
 * the raw originals; otherwise each photo (beautified if it was) is submitted.
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
  // Obverse/reverse chooser, shown when compositing more than two photos.
  const [picking, setPicking] = useState(false);
  const [obvId, setObvId] = useState<string | null>(null);
  const [revId, setRevId] = useState<string | null>(null);

  const urlOf = (path: string) =>
    supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
  const slotImg = (s: Slot) => urlOf(s.cutout ?? s.original);
  const disabled = busy !== null;

  // The photos that go INTO the composite: all of them when there are 1-2, or
  // the chosen obverse + reverse when there are more.
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
        if (path)
          setSlots((prev) => [
            ...prev,
            { id: crypto.randomUUID(), original: path, cutout: null },
          ]);
      }
      resetDerived();
    } finally {
      setBusy(null);
    }
  }

  async function beautifySlot(id: string) {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    setBusy(`beautify:${id}`);
    setError(null);
    setNote(null);
    try {
      const cut = await beautifyPhoto(slot.original);
      if (cut) {
        setSlots((prev) =>
          prev.map((s) => (s.id === id ? { ...s, cutout: cut } : s)),
        );
        setComposite(null);
      } else {
        setNote(
          "That photo couldn't be beautified — a slabbed coin is kept in its holder. The original will be used.",
        );
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

  // Main "Create composite" button: with >2 photos, open the obverse/reverse
  // chooser first; otherwise composite straight away.
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

  // Each photo contributes its beautified version when it has one, otherwise
  // the original. When a composite exists it leads, followed by those photos.
  const photoPaths = slots.map((s) => s.cutout ?? s.original);
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
                src={slotImg(s)}
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
        {/* Left: uploaded photos + controls */}
        <div className="space-y-4 lg:flex-1">
          <div className="flex flex-wrap gap-3">
            {slots.map((s) => (
              <div key={s.id} className="space-y-1.5">
                <div className="relative h-28 w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slotImg(s)}
                    alt=""
                    className="h-28 w-28 rounded-md border bg-muted object-contain"
                  />
                  {s.cutout && (
                    <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px] font-medium">
                      ✓ bg removed
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
                </div>
                <button
                  type="button"
                  onClick={() => beautifySlot(s.id)}
                  disabled={disabled}
                  className="w-28 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  {busy === `beautify:${s.id}`
                    ? "Beautifying…"
                    : s.cutout
                      ? "Beautify again"
                      : "✨ Beautify"}
                </button>
              </div>
            ))}

            <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground hover:bg-muted">
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
            <div className="space-y-3">
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
                  <div className="flex items-center gap-2">
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
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => chooseColor(e.target.value)}
                      disabled={disabled}
                      aria-label="Custom background color"
                      className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
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

              {/* Obverse / reverse chooser (only with more than two photos) */}
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

        {/* Right: composite result */}
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
