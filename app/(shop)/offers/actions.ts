"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Buyer accepts a seller's counter -> the shared accept_offer completes the sale. */
export async function acceptCounter(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "");
  if (!offerId) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_offer", { p_offer_id: offerId });
  if (error) {
    redirect(`/offers?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/offers?accepted=1");
}

/** Buyer declines a counter. */
export async function declineCounter(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "");
  if (!offerId) return;
  const supabase = await createClient();
  await supabase
    .from("offers")
    .update({ status: "declined" })
    .eq("id", offerId)
    .eq("status", "pending");
  redirect("/offers");
}
