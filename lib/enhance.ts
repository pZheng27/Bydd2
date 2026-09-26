import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Coin photo enhancement, backed by the Numismatic Photo Formatter HTTP service.
// Two on-demand operations the upload form calls:
//   - cutoutStoredPhoto  ("beautify")     -> remove a photo's background
//   - compositeStoredPhotos ("composite") -> combine 1-2 photos on a backdrop
// Both download the source from storage, call the formatter, and store the
// result back in the same bucket. Best-effort: they never throw, returning null
// when the formatter is off, refuses a slab, or errors — the caller keeps the
// original photo in that case.

const BUCKET = "item-photos";
const FORMATTER_URL = process.env.FORMATTER_URL;
const FORMATTER_API_KEY = process.env.FORMATTER_API_KEY;

/** Whether the formatter service is wired up (URL + key present). */
export function formatterConfigured(): boolean {
  return !!FORMATTER_URL && !!FORMATTER_API_KEY;
}

function folderOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "misc";
}

/** Store a base64 PNG next to `folder`; returns its object path or null. */
async function storePng(
  admin: SupabaseClient,
  folder: string,
  base64: string,
): Promise<string | null> {
  const outPath = `${folder}/${randomUUID()}.png`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(outPath, Buffer.from(base64, "base64"), {
      contentType: "image/png",
      upsert: false,
    });
  return error ? null : outPath;
}

/**
 * Beautify: remove the background from a stored photo. Returns the new
 * transparent-PNG object path, or null (formatter off, a slabbed coin the
 * service refuses, or any error). Never throws.
 */
export async function cutoutStoredPhoto(path: string): Promise<string | null> {
  if (!formatterConfigured() || !path) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !blob) return null;
    const form = new FormData();
    form.append("file", blob, "coin");
    const res = await fetch(`${FORMATTER_URL}/cutout`, {
      method: "POST",
      headers: { "X-API-Key": FORMATTER_API_KEY as string },
      body: form,
    });
    if (!res.ok) return null;
    const out = (await res.json()) as {
      cut_out?: boolean;
      image_png_base64?: string | null;
    };
    if (!out?.cut_out || !out.image_png_base64) return null;
    return storePng(admin, folderOf(path), out.image_png_base64);
  } catch {
    return null;
  }
}

/**
 * Flatten an already cut-out stored photo onto a solid colour, tight to the
 * coin (no padding). Returns the new object path or null. Never throws.
 */
export async function flattenStoredPhoto(
  path: string,
  background: string,
): Promise<string | null> {
  if (!formatterConfigured() || !path) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !blob) return null;
    const form = new FormData();
    form.append("file", blob, "coin");
    form.append("background", background);
    const res = await fetch(`${FORMATTER_URL}/flatten`, {
      method: "POST",
      headers: { "X-API-Key": FORMATTER_API_KEY as string },
      body: form,
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { image_png_base64?: string | null };
    if (!out?.image_png_base64) return null;
    return storePng(admin, folderOf(path), out.image_png_base64);
  } catch {
    return null;
  }
}

/**
 * Rotate a stored (cut-out) photo clockwise by `degrees`. Returns the new
 * object path or null. Never throws.
 */
export async function rotateStoredPhoto(
  path: string,
  degrees: number,
): Promise<string | null> {
  if (!formatterConfigured() || !path) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !blob) return null;
    const form = new FormData();
    form.append("file", blob, "coin.png");
    form.append("degrees", String(degrees));
    const res = await fetch(`${FORMATTER_URL}/rotate`, {
      method: "POST",
      headers: { "X-API-Key": FORMATTER_API_KEY as string },
      body: form,
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { image_png_base64?: string | null };
    if (!out?.image_png_base64) return null;
    return storePng(admin, folderOf(path), out.image_png_base64);
  } catch {
    return null;
  }
}

/**
 * Composite one or two stored photos (front[, back]) onto a background —
 * "shadow" (the studio look) or a solid "#RRGGBB". Returns the new PNG object
 * path, or null on any failure. Never throws.
 */
export async function compositeStoredPhotos(
  paths: string[],
  background: string,
): Promise<string | null> {
  if (!formatterConfigured() || paths.length === 0) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const form = new FormData();
    let n = 0;
    for (const p of paths.slice(0, 8)) {
      const dl = await admin.storage.from(BUCKET).download(p);
      if (dl.data) {
        form.append("files", dl.data, `photo-${n}`);
        n += 1;
      }
    }
    if (n === 0) return null;
    form.append("background", background || "shadow");
    const res = await fetch(`${FORMATTER_URL}/composite`, {
      method: "POST",
      headers: { "X-API-Key": FORMATTER_API_KEY as string },
      body: form,
    });
    if (!res.ok) return null;
    const out = (await res.json()) as {
      composited?: boolean;
      image_png_base64?: string | null;
    };
    if (!out?.composited || !out.image_png_base64) return null;
    return storePng(admin, folderOf(paths[0]), out.image_png_base64);
  } catch {
    return null;
  }
}

/**
 * Build the index-aligned `photos_original` array from the display paths a form
 * submitted plus its `photo_originals_map` field(s) — JSON objects mapping a
 * display path to the raw original kept for the "view original" toggle. A
 * display path with no mapping gets an empty string.
 */
export function readPhotosOriginal(
  displayPaths: string[],
  mapValues: string[],
): string[] {
  const merged: Record<string, string> = {};
  for (const m of mapValues) {
    try {
      Object.assign(merged, JSON.parse(m));
    } catch {
      /* ignore malformed map */
    }
  }
  return displayPaths.map((p) => merged[p] ?? "");
}

/**
 * Delete stored photo objects using the service-role client, so it can also
 * remove enhanced/composite files the formatter created (which have no user
 * owner). Caller must have verified ownership. No-op on empty; never throws.
 */
export async function removeStoredPhotos(paths: string[]): Promise<void> {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin.storage.from(BUCKET).remove(clean);
  } catch {
    /* best-effort cleanup */
  }
}
