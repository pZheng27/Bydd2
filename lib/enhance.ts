import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Enhanced coin photos: send each uploaded photo to the Numismatic Photo
// Formatter (a small HTTP service), store the prettified PNG next to the
// original, and swap it into `photos` so it shows by default. The raw upload is
// kept in `photos_original` for the "view original" toggle. All of this is
// best-effort and runs in the background (via `after()`), so it never blocks or
// breaks an upload — a coin whose photo can't be enhanced simply keeps its
// original.

const BUCKET = "item-photos";
const FORMATTER_URL = process.env.FORMATTER_URL;
const FORMATTER_API_KEY = process.env.FORMATTER_API_KEY;
const PRESET = process.env.FORMATTER_PRESET || "dark_gradient";

/** Whether the formatter service is wired up (URL + key present). */
export function formatterConfigured(): boolean {
  return !!FORMATTER_URL && !!FORMATTER_API_KEY;
}

/**
 * Enhance one stored photo. Returns the new enhanced object path, or null when
 * it can't/shouldn't be enhanced (formatter off, a slabbed coin the service
 * refuses, or any error). Never throws.
 */
async function enhanceOne(
  admin: SupabaseClient,
  path: string,
): Promise<string | null> {
  try {
    // 1. Pull the raw original bytes straight from storage.
    const { data: blob, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(path);
    if (dlErr || !blob) return null;

    // 2. Ask the formatter to prettify it.
    const form = new FormData();
    form.append("file", blob, "coin");
    form.append("preset", PRESET);
    const res = await fetch(`${FORMATTER_URL}/format`, {
      method: "POST",
      headers: { "X-API-Key": FORMATTER_API_KEY as string },
      body: form,
    });
    if (!res.ok) return null;
    const out = (await res.json()) as {
      formatted?: boolean;
      image_png_base64?: string | null;
    };
    // Slabbed coins come back formatted:false with no image — keep the original.
    if (!out?.formatted || !out.image_png_base64) return null;

    // 3. Store the enhanced PNG alongside the original (same folder).
    const folder = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "misc";
    const enhancedPath = `${folder}/${randomUUID()}.enhanced.png`;
    const bytes = Buffer.from(out.image_png_base64, "base64");
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(enhancedPath, bytes, { contentType: "image/png", upsert: false });
    if (upErr) return null;
    return enhancedPath;
  } catch {
    return null;
  }
}

/**
 * Enhance a single already-uploaded photo (by its storage path), on demand.
 * Returns the new enhanced object path, or null when it can't/shouldn't be
 * enhanced (formatter off, a slabbed coin the service refuses, or any error).
 * Never throws.
 */
export async function enhanceStoredPhoto(path: string): Promise<string | null> {
  if (!formatterConfigured() || !path) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  return enhanceOne(admin, path);
}

/**
 * Build the index-aligned `photos_original` array from the display paths a form
 * submitted plus its `photo_originals_map` field(s) — JSON objects mapping a
 * display path to the raw original kept for the "view original" toggle. A
 * display path with no mapping (never enhanced) gets an empty string.
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
 * Delete stored photo objects (originals + enhanced) using the service-role
 * client, so it can also remove enhanced files the formatter created (which
 * have no user owner). Caller must have already verified ownership — pass only
 * paths from a row the user was allowed to delete. No-op on empty; never throws.
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
