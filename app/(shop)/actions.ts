"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

async function myProfileId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  return data?.id ?? null;
}

/** Add or remove a listing from the buyer's watchlist. */
export async function toggleSave(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const saved = formData.get("saved") === "true";
  if (!itemId) return;
  const supabase = await createClient();
  const pid = await myProfileId(supabase);
  if (!pid) return;

  if (saved) {
    await supabase
      .from("saved_items")
      .delete()
      .eq("profile_id", pid)
      .eq("inventory_item_id", itemId);
  } else {
    await supabase
      .from("saved_items")
      .insert({ profile_id: pid, inventory_item_id: itemId });
  }
  redirect(`/market/${itemId}`);
}

/** Send a single offer to the seller of a listing. */
export async function makeOffer(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const price = Number(formData.get("price"));
  const message = (formData.get("message") as string | null)?.trim() || null;
  if (!itemId || Number.isNaN(price)) return;

  const supabase = await createClient();
  const pid = await myProfileId(supabase);
  if (!pid) return;

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, dealers(profile_id)")
    .eq("id", itemId)
    .single();
  const sellerId = (item as { dealers?: { profile_id?: string } } | null)?.dealers
    ?.profile_id;
  if (!sellerId) return;

  await supabase.from("offers").insert({
    inventory_item_id: itemId,
    from_profile_id: pid,
    to_profile_id: sellerId,
    price_cents: Math.round(price * 100),
    message,
  });
  redirect("/offers");
}

/** Complete a simulated buy-now purchase via the secure DB function. */
export async function completePurchase(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_item", { p_item_id: itemId });
  if (error) {
    redirect(`/market/${itemId}?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/orders?purchased=1");
}
