"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRoutingForWant } from "@/lib/routing-run";
import type { SupabaseClient } from "@supabase/supabase-js";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.trim();
  return s ? s : null;
}
function toNum(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
function toCents(v: FormDataEntryValue | null): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n * 100);
}
function grade(v: FormDataEntryValue | null): number | null {
  const n = toNum(v);
  return n != null && n >= 1 && n <= 70 ? Math.round(n) : null;
}

async function myProfileId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return prof?.id ?? null;
}

/** Create a want (a coin the collector is looking for). */
export async function addWant(formData: FormData) {
  const supabase = await createClient();
  const profileId = await myProfileId(supabase);
  if (!profileId) return;
  const { data: created } = await supabase
    .from("wants")
    .insert({
      profile_id: profileId,
      coin_type_id: str(formData.get("coin_type_id")),
      title: str(formData.get("title")) ?? "Untitled want",
      grade_min: grade(formData.get("grade_min")),
      grade_max: grade(formData.get("grade_max")),
      budget_cents: toCents(formData.get("budget")),
      notes: str(formData.get("notes")),
    })
    .select("id")
    .single();

  // Route the new want to the dealers most likely to have it (best-effort; a
  // routing hiccup must not break creating the want).
  if (created) {
    const admin = createAdminClient();
    if (admin) {
      try {
        await runRoutingForWant(admin, created.id);
      } catch (e) {
        console.error("routing failed for want", created.id, e);
      }
    }
  }

  redirect("/wants");
}

/** Update an existing want (RLS scopes to the owner). */
export async function updateWant(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("wants")
    .update({
      title: str(formData.get("title")) ?? "Untitled want",
      grade_min: grade(formData.get("grade_min")),
      grade_max: grade(formData.get("grade_max")),
      budget_cents: toCents(formData.get("budget")),
      notes: str(formData.get("notes")),
      status: str(formData.get("status")) ?? "open",
    })
    .eq("id", id);
  redirect("/wants");
}

const WANT_STATUSES = new Set(["open", "filled", "cancelled"]);

/**
 * Quick status change from the Wants list: fulfill (filled), pause (cancelled),
 * or reopen (open). Reopening re-routes the want so it goes back out to dealers.
 */
export async function setWantStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !WANT_STATUSES.has(status)) return;
  const supabase = await createClient();
  await supabase.from("wants").update({ status }).eq("id", id);

  if (status === "open") {
    const admin = createAdminClient();
    if (admin) {
      try {
        await runRoutingForWant(admin, id);
      } catch (e) {
        console.error("re-route on reopen failed", id, e);
      }
    }
  }
  redirect("/wants");
}

/** Delete a want. */
export async function deleteWant(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("wants").delete().eq("id", id);
  redirect("/wants");
}
