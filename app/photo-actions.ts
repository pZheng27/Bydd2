"use server";

import { createClient } from "@/lib/supabase/server";
import {
  cutoutStoredPhoto,
  compositeStoredPhotos,
  flattenStoredPhoto,
  rotateStoredPhoto,
} from "@/lib/enhance";

async function isSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

/**
 * Beautify (remove the background from) an already-uploaded photo. Returns the
 * new transparent-PNG path, or null (slab / formatter off / error). Requires a
 * signed-in user.
 */
export async function beautifyPhoto(path: string): Promise<string | null> {
  if (!path || !(await isSignedIn())) return null;
  return cutoutStoredPhoto(path);
}

/**
 * Recolour an already cut-out photo: flatten it onto a solid "#RRGGBB"
 * background, tight to the coin (no padding). Returns the new path, or null.
 * Requires a signed-in user.
 */
export async function flattenPhoto(
  path: string,
  background: string,
): Promise<string | null> {
  if (!path || !(await isSignedIn())) return null;
  const bg = /^#[0-9a-fA-F]{6}$/.test(background ?? "") ? background : "#ffffff";
  return flattenStoredPhoto(path, bg);
}

/**
 * Rotate an already cut-out photo clockwise by `degrees`. Returns the new path,
 * or null. Requires a signed-in user.
 */
export async function rotatePhoto(
  path: string,
  degrees: number,
): Promise<string | null> {
  if (!path || !(await isSignedIn())) return null;
  const d = ((Math.round(degrees) % 360) + 360) % 360;
  return rotateStoredPhoto(path, d);
}

/**
 * Composite 1–2 uploaded photos onto a background: "shadow" or a solid
 * "#RRGGBB". Returns the composite PNG path, or null. Requires a signed-in user.
 */
export async function composePhotos(
  paths: string[],
  background: string,
): Promise<string | null> {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  if (!(await isSignedIn())) return null;
  const bg =
    background === "shadow" || /^#?[0-9a-fA-F]{6}$/.test(background ?? "")
      ? background
      : "shadow";
  return compositeStoredPhotos(paths.filter(Boolean).slice(0, 8), bg);
}
