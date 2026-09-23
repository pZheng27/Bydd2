"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { beautifyPhoto, composePhotos } from "@/app/photo-actions";

type Slot = { original: string; cutout: string | null };

const SWATCHES = ["#ffffff", "#f4f4f5", "#111114", "#1e293b", "#3f3f46"];

/**
 * Photo uploader with an in-form beautify + composite flow.
 *
 * Flow: add a front (and optional back) photo → "Beautify" removes the
 * background on each → pick a background (Plain solid colour, or the Shadow
 * studio look) → "Create composite" combines them into one product image;
 * toggling Plain/Shadow or the colour re-renders it live. On submit the
 * composite is the listing's main photo and the untouched originals are kept
 * alongside it as gallery photos.
 *
 * Emits name="photos" hidden inputs: the composite first (when made), then the
 * raw originals.
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

  const [front, setFront] = useState<Slot | null>(null);
  const [back, setBack] = useState<Slot | null>(null);
  const [composite, setComposite] = useState<string | null>(null);
  const [bg, setBg] = useState<"shadow" | "plain">("shadow");
  const [color, setColor] = useState("#ffffff");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlOf = (path: string) =>
    supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
  const slotImg = (s: Slot) => urlOf(s.cutout ?? s.original);
  const beautified = !!(front?.cutout || back?.cutout);
  const disabled = busy !== null;

  // Paths sent to the composite endpoint: the cutout when beautified, else the
  // raw original (the endpoint beautifies raw inputs itself).
  function srcPaths(): string[] {
    const p: string[] = [];
    if (front) p.push(front.cutout ?? front.original);
    if (back) p.push(back.cutout ?? back.original);
    return p;
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

  async function onSelect(
    which: "front" | "back",
    e: ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(`upload-${which}`);
    setError(null);
    setNote(null);
    try {
      const path = await upload(file);
      if (!path) return;
      const slot: Slot = { original: path, cutout: null };
      if (which === "front") setFront(slot);
      else setBack(slot);
      setComposite(null); // sources changed — any existing composite is stale
    } finally {
      setBusy(null);
    }
  }

  async function onBeautify() {
    setBusy("beautify");
    setError(null);
    setNote(null);
    try {
      let anyFail = false;
      if (front) {
        const c = await beautifyPhoto(front.original);
        if (c) setFront({ ...front, cutout: c });
        else anyFail = true;
      }
      if (back) {
        const c = await beautifyPhoto(back.original);
        if (c) setBack({ ...back, cutout: c });
        else anyFail = true;
      }
      setComposite(null);
      if (anyFail)
        setNote(
          "One or more photos couldn't be beautified — a slabbed coin is kept in its holder. You can still create a composite from the originals.",
        );
    } finally {
      setBusy(null);
    }
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
        setError("Couldn't create the composite. Please try again.");
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

  function removeSlot(which: "front" | "back") {
    const s = which === "front" ? front : back;
    if (s?.original) supabase.storage.from("item-photos").remove([s.original]);
    if (which === "front") setFront(null);
    else setBack(null);
    setComposite(null);
  }

  // The composite (if made) is the hero; raw originals follow so buyers can
  // still see each true-colour side.
  const submitPhotos: string[] = [];
  if (composite) submitPhotos.push(composite);
  if (front) submitPhotos.push(front.original);
  if (back) submitPhotos.push(back.original);

  return (
    <div className="space-y-4">
      {submitPhotos.map((p, i) => (
        <input key={`${p}-${i}`} type="hidden" name="photos" value={p} />
      ))}

      <div className="flex flex-wrap gap-3">
        {(["front", "back"] as const).map((which) => {
          const s = which === "front" ? front : back;
          return s ? (
            <div key={which} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slotImg(s)}
                alt={which}
                className="h-28 w-28 rounded-md border bg-muted object-contain"
              />
              <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px] font-medium capitalize">
                {which}
                {s.cutout ? " ✓" : ""}
              </span>
              <button
                type="button"
                onClick={() => removeSlot(which)}
                disabled={disabled}
                className="absolute -right-2 -top-2 rounded-full border bg-background px-1.5 text-xs leading-5 hover:bg-muted"
                aria-label={`Remove ${which}`}
              >
                ✕
              </button>
            </div>
          ) : (
            <label
              key={which}
              className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground hover:bg-muted"
            >
              {busy === `upload-${which}`
                ? "Uploading…"
                : which === "front"
                  ? "+ Front photo"
                  : "+ Back photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onSelect(which, e)}
                disabled={disabled}
              />
            </label>
          );
        })}
      </div>

      {front && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onBeautify}
            disabled={disabled}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {busy === "beautify"
              ? "Beautifying…"
              : beautified
                ? "✨ Beautify again"
                : "✨ Beautify (remove background)"}
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border text-sm">
              <button
                type="button"
                onClick={() => chooseBg("plain")}
                disabled={disabled}
                className={
                  "px-3 py-1.5 font-medium " +
                  (bg === "plain" ? "bg-foreground text-background" : "hover:bg-muted")
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
                  (bg === "shadow" ? "bg-foreground text-background" : "hover:bg-muted")
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
            {busy === "compose"
              ? "Working…"
              : composite
                ? "Update composite"
                : "Create composite"}
          </button>

          {composite && (
            <div className="space-y-1">
              <div className="w-full max-w-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlOf(composite)}
                  alt="Composite"
                  className="aspect-square w-full rounded-lg border bg-muted object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This composite is your listing photo. Your original
                {back ? " front and back photos are" : " photo is"} kept
                alongside it.
              </p>
            </div>
          )}
        </div>
      )}

      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
