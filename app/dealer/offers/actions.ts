"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Seller accepts an offer -> secure DB function creates the sale. */
export async function acceptOffer(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "");
  if (!offerId) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_offer", { p_offer_id: offerId });
  if (error) {
    redirect(`/dealer/offers?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dealer/offers?accepted=1");
}

/** Seller declines a pending offer. */
export async function declineOffer(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "");
  if (!offerId) return;
  const supabase = await createClient();
  await supabase
    .from("offers")
    .update({ status: "declined" })
    .eq("id", offerId)
    .eq("status", "pending");
  redirect("/dealer/offers");
}

/** Seller counters an offer with a new price -> secure DB function. */
export async function counterOffer(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "");
  const raw = String(formData.get("price") ?? "").replace(/[$,\s]/g, "");
  const dollars = Number(raw);
  if (!offerId || !raw || !Number.isFinite(dollars) || dollars <= 0) {
    redirect(`/dealer/offers?error=${encodeURIComponent("Enter a counter price.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("counter_offer", {
    p_offer_id: offerId,
    p_price_cents: Math.round(dollars * 100),
    p_message: null,
  });
  if (error) {
    redirect(`/dealer/offers?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dealer/offers?countered=1");
}
