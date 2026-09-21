import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A service-role Supabase client for SYSTEM work that must act across users —
 * routing wants to dealers, cron jobs, writing another party's notifications.
 * It bypasses RLS, so use it only in trusted server code, never with
 * user-supplied filters that could leak data. Returns null if the secret key
 * isn't configured (so callers can degrade gracefully in local dev).
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
