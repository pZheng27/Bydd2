import "server-only";
import { createClient } from "@/lib/supabase/server";

// Global launch mode. `marketplace_enabled = false` limits the app to the
// Collections / photo-editor product; true (the default) is the full
// marketplace. Reads are tolerant: if the app_settings table isn't there yet
// (migration not run), we behave as the full marketplace so nothing breaks.

export async function getMarketplaceEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("marketplace_enabled")
      .eq("id", true)
      .maybeSingle();
    return data?.marketplace_enabled ?? true;
  } catch {
    return true;
  }
}

/** Whether the signed-in user is an admin (profiles.is_admin). */
export async function currentIsAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    return !!data?.is_admin;
  } catch {
    return false;
  }
}
