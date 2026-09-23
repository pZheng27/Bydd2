"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { enhanceUploadedPhoto } from "@/app/photo-actions";

/**
 * Single-photo uploader with an in-form enhancement step.
 *
 * Flow: the seller adds a photo (shown as the original) → optionally clicks
 * "Enhance photo", which sends it to the formatter and shows the prettified
 * result → they can toggle between Enhanced and Original to decide what buyers
 * see → then submit. Whatever is selected becomes the listing's display photo;
 * if that's the enhanced one, the raw original is kept so the listing offers a
 * "view original" toggle too.
 *
 * Emits into the surrounding form:
 *   - name="photos"              → the chosen display path
 *   - name="photo_originals_map" → JSON { [displayPath]: rawPath }, only when
 *     the enhanced photo is the chosen display
 *
 * One photo for now — obverse/reverse comes later.
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

  const [original, setOriginal] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [choice, setChoice] = useState<"original" | "enhanced">("original");
  const [busy, setBusy] = useState<null | "upload" | "enhance">(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlOf = (path: string) =>
    supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;

  const displayPath = choice === "enhanced" && enhanced ? enhanced : original;
  const showToggle = !!enhanced && !!original;

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload");
    setError(null);
    setNote(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("item-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      setOriginal(path);
      setEnhanced(null);
      setChoice("original");
    } finally {
      setBusy(null);
    }
  }

  async function onEnhance() {
    if (!original) return;
    setBusy("enhance");
    setError(null);
    setNote(null);
    try {
      const result = await enhanceUploadedPhoto(original);
      if (result) {
        setEnhanced(result);
        setChoice("enhanced");
      } else {
        setNote(
          "Couldn't enhance this one — it may be a slabbed coin (kept in its holder) or the enhancer is unavailable. Your original photo will be used.",
        );
      }
    } catch {
      setError("Enhancement failed — your original photo will be used.");
    } finally {
      setBusy(null);
    }
  }

  function onRemove() {
    // Best-effort: drop the raw original (owned by this user). An enhanced copy,
    // if any, is left in storage.
    if (original) supabase.storage.from("item-photos").remove([original]);
    setOriginal(null);
    setEnhanced(null);
    setChoice("original");
    setNote(null);
    setError(null);
  }

  return (
    <div className="space-y-3">
      {displayPath && (
        <>
          <input type="hidden" name="photos" value={displayPath} />
          {choice === "enhanced" && enhanced && original && (
            <input
              type="hidden"
              name="photo_originals_map"
              value={JSON.stringify({ [enhanced]: original })}
            />
          )}
        </>
      )}

      {!original ? (
        <label className="flex h-40 w-full max-w-sm cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground hover:bg-muted">
          {busy === "upload" ? "Uploading…" : "+ Add a photo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onSelect}
            disabled={busy !== null}
          />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="relative w-full max-w-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlOf(displayPath as string)}
              alt=""
              className="aspect-square w-full rounded-lg border bg-muted object-contain"
            />
            <button
              type="button"
              onClick={onRemove}
              className="absolute -right-2 -top-2 rounded-full border bg-background px-1.5 text-xs leading-5 hover:bg-muted"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>

          {!showToggle ? (
            <button
              type="button"
              onClick={onEnhance}
              disabled={busy !== null}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              {busy === "enhance" ? "Enhancing…" : "✨ Enhance photo"}
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="inline-flex overflow-hidden rounded-md border text-sm">
                <button
                  type="button"
                  onClick={() => setChoice("enhanced")}
                  className={
                    "px-3 py-1.5 font-medium " +
                    (choice === "enhanced"
                      ? "bg-foreground text-background"
                      : "hover:bg-muted")
                  }
                >
                  Enhanced
                </button>
                <button
                  type="button"
                  onClick={() => setChoice("original")}
                  className={
                    "border-l px-3 py-1.5 font-medium " +
                    (choice === "original"
                      ? "bg-foreground text-background"
                      : "hover:bg-muted")
                  }
                >
                  Original
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing the <span className="font-medium">{choice}</span> photo —
                this is what buyers see first
                {choice === "enhanced"
                  ? "; they can still switch to the original on the listing."
                  : "."}
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
