"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findUpcomingAuctionLots } from "@/lib/auction-watch";

/** Turn the weekly auction-watch on/off for one coin (opt-in). */
export async function setWatchAuctions(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const on = formData.get("on") === "true";
  if (!itemId) return;
  const supabase = await createClient();
  await supabase
    .from("inventory_items")
    .update({ watch_auctions: on })
    .eq("id", itemId);
  revalidatePath(`/dealer/inventory/${itemId}`);
}

/** Manual "Check now" — search Numisbids upcoming lots for this coin right away. */
export async function checkAuctionsNow(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select(
      "id, title, series, year, mintmark, variety, metal, grade, designation, grading_service",
    )
    .eq("id", itemId)
    .single();
  if (!item) return;

  const lots = await findUpcomingAuctionLots(item);

  await supabase.from("auction_watch_hits").delete().eq("inventory_item_id", itemId);
  if (lots.length > 0) {
    await supabase.from("auction_watch_hits").insert(
      lots.map((l) => ({
        inventory_item_id: itemId,
        lot_title: l.title,
        price_text: l.price,
        auction_house: l.auction_house,
        sale_date_text: l.sale_date,
        url: l.url,
      })),
    );
  }
  await supabase
    .from("inventory_items")
    .update({ auctions_checked_at: new Date().toISOString() })
    .eq("id", itemId);

  revalidatePath(`/dealer/inventory/${itemId}`);
}
