"use server";

import { createClient } from "@/lib/supabase/server";
import { enhanceStoredPhoto } from "@/lib/enhance";

/**
 * Enhance an already-uploaded photo (by its storage path) on demand from the
 * upload form. Returns the enhanced object path, or null when it couldn't be
 * enhanced (a slabbed coin the formatter refuses, the service being off, or any
 * error). Requires a signed-in user.
 */
export async function enhanceUploadedPhoto(
  path: string,
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return enhanceStoredPhoto(path);
}
