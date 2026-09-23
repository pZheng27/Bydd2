"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { beautifyPhoto, composePhotos } from "@/app/photo-actions";

type Slot = { id: string; original: string; cutout: string | null };

const SWATCHES = ["#ffffff", "#f4f4f5", "#111114", "#1e293b", "#3f3f46"];

/**
 * Photo uploader with an in-form beautify + composite flow.
 *
 * Add any number of photos. Each has its own "Beautify" (background removal).
 * Pick a background — Plain (a solid colour, with swatches + a colour picker) or
 * Shadow (the studio look) — and "Create composite" combines the photos into one
 * product image shown to the right; toggling background/colour re-renders it. A
 * single photo (e.g. an already-composited front+back shot) can be processed on
 * its own the same way.
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

  const urlOf = (path: string) =>
    supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
  const slotImg = (s: Slot) => urlOf(s.cutout ?? s.original);
  const disabled = busy !== null;
  const srcPaths = () => slots.map((s) => s.cutout ?? s.original);

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
      setComposite(null); // sources changed
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
    setComposite(null);
  }

  async function makeComposite(nextBg?: "shadow" | "plain", nextColor?: string) {
    const paths = srcPaths();
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

  function chooseBg(next: "shadow" | "plain") {
    setBg(next);
    if (composite) makeComposite(next, color);
  }
  function chooseColor(next: string) {
    setColor(next);
    if (composite && bg === "plain") makeComposite("plain", next);
  }

  const submitPhotos: string[] = composite
    ? [composite, ...slots.map((s) => s.original)]
    : slots.map((s) => s.cutout ?? s.original);

  const composeLabel = busy === "compose"
    ? "Working…"
    : composite
      ? "Update"
      : slots.length > 1
        ? "Create composite"
        : "Apply background";

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

              <button
                type="button"
                onClick={() => makeComposite()}
                disabled={disabled}
                className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
              >
                {composeLabel}
              </button>
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
