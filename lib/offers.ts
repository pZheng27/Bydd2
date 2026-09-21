import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mark pending offers past their 48-hour expiry as expired. Service-role work
 * (runs in the daily cron across all users). Returns how many were expired.
 */
export async function expireStaleOffers(
  admin: SupabaseClient,
): Promise<{ expired: number }> {
  const { data } = await admin
    .from("offers")
    .update({ status: "expired", cancel_reason: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return { expired: data?.length ?? 0 };
}
