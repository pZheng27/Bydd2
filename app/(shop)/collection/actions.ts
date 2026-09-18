"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

/** The signed-in user's collection id (auto-created in S2; create if missing). */
async function myCollectionId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prof) return null;
  const { data: col } = await supabase
    .from("collections")
    .select("id")
    .eq("profile_id", prof.id)
    .maybeSingle();
  if (col) return col.id;
  const created = await supabase
    .from("collections")
    .insert({ profile_id: prof.id })
    .select("id")
    .single();
  return created.data?.id ?? null;
}

/** Add a coin the collector owns (hand-entered). */
export async function addCollectionItem(formData: FormData) {
  const supabase = await createClient();
  const collectionId = await myCollectionId(supabase);
  if (!collectionId) return;

  const grade = toNum(formData.get("grade"));
  const gradeVal =
    grade != null && grade >= 1 && grade <= 70 ? Math.round(grade) : null;
  const photos = formData.getAll("photos").map(String).filter(Boolean);

  await supabase.from("collection_items").insert({
    collection_id: collectionId,
    title: str(formData.get("title")) ?? "Untitled coin",
    grading_service: str(formData.get("grading_service")),
    cert_number: str(formData.get("cert_number")),
    grade: gradeVal,
    notes: str(formData.get("notes")),
    acquired_price_cents: toCents(formData.get("acquired_price")),
    photos,
  });

  redirect("/collection");
}

/** Remove a coin from the collection (and its photos). */
export async function deleteCollectionItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("collection_items")
    .select("photos")
    .eq("id", id)
    .single();
  if (item?.photos?.length) {
    await supabase.storage.from("item-photos").remove(item.photos);
  }
  await supabase.from("collection_items").delete().eq("id", id);
  redirect("/collection");
}
