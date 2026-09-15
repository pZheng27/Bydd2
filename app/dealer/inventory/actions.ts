"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

/**
 * Insert a hand-entered coin. Items go live on the marketplace immediately
 * (status = listed, public). Structured coin columns exist but are populated
 * later (catalog / CSV import).
 */
export async function addInventoryItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return;

  let { data: dealer } = await supabase
    .from("dealers")
    .select("id")
    .eq("profile_id", profile.id)
    .single();
  if (!dealer) {
    const created = await supabase
      .from("dealers")
      .insert({ profile_id: profile.id })
      .select("id")
      .single();
    dealer = created.data;
  }
  if (!dealer) return;

  const title = str(formData.get("title")) ?? "Untitled coin";
  const gradingService = str(formData.get("grading_service"));
  const certNumber = str(formData.get("cert_number"));
  const costCents = toCents(formData.get("cost"));
  const priceCents = toCents(formData.get("price")) ?? 0;
  const description = str(formData.get("description"));
  const shippingNote = str(formData.get("shipping_note"));
  const photos = formData.getAll("photos").map(String).filter(Boolean);

  const { data: created } = await supabase
    .from("inventory_items")
    .insert({
      dealer_id: dealer.id,
      title,
      grading_service: gradingService,
      cert_number: certNumber,
      price_cents: priceCents,
      description,
      shipping_note: shippingNote,
      photos,
      status: "listed",
      is_public: true,
      listed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // Cost is private (a dealer's margin) — stored in an owner-only table.
  if (created && costCents != null) {
    await supabase
      .from("inventory_costs")
      .insert({ inventory_item_id: created.id, cost_cents: costCents });
  }

  redirect("/dealer/inventory");
}

/** List or unlist an item on the marketplace. */
export async function setItemListed(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const listed = formData.get("listed") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("inventory_items")
    .update({
      status: listed ? "listed" : "unlisted",
      is_public: listed,
      listed_at: listed ? new Date().toISOString() : null,
    })
    .eq("id", id);
  redirect(`/dealer/inventory/${id}`);
}

/** Permanently delete an item and its photos. */
export async function deleteItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select("photos")
    .eq("id", id)
    .single();
  if (item?.photos?.length) {
    await supabase.storage.from("item-photos").remove(item.photos);
  }
  await supabase.from("inventory_items").delete().eq("id", id);
  redirect("/dealer/inventory");
}
