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
