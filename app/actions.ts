"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentIsAdmin } from "@/lib/app-settings";

/** Sign the user out and return them to the login screen. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Admin-only: switch the global launch mode between the full marketplace and
 * the Collections-only launch view. The form sends the target as `enabled`.
 */
export async function setMarketplaceMode(formData: FormData) {
  if (!(await currentIsAdmin())) return;
  const admin = createAdminClient();
  if (!admin) return;
  const enabled = formData.get("enabled") === "true";
  await admin
    .from("app_settings")
    .update({ marketplace_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", true);
  // Refresh every page so the nav and route guards pick up the new mode.
  revalidatePath("/", "layout");
}
