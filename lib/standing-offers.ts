import type { SupabaseClient } from "@supabase/supabase-js";
import { embeddedOne } from "@/lib/catalog";

type StandingOffer = {
  id: string;
  profile_id: string;
  coin_type_id: string;
  max_price_cents: number;
  grade_min: number | null;
  grade_max: number | null;
};

type ListingRow = {
  id: string;
  price_cents: number;
  grade: number | null;
  dealer: { profile_id: string } | { profile_id: string }[] | null;
};

/** Fire auto-offers for one standing rule on every matching listing not already
 *  offered on. Returns how many offers it created. */
async function fireForStandingOffer(
  admin: SupabaseClient,
  so: StandingOffer,
): Promise<number> {
  const { data: items } = await admin
    .from("inventory_items")
    .select("id, price_cents, grade, dealer:dealers(profile_id)")
    .eq("status", "listed")
    .eq("is_public", true)
    .eq("coin_type_id", so.coin_type_id)
    .lte("price_cents", so.max_price_cents);

  let fired = 0;
  for (const it of (items ?? []) as ListingRow[]) {
    if (so.grade_min != null && (it.grade == null || it.grade < so.grade_min)) continue;
    if (so.grade_max != null && (it.grade == null || it.grade > so.grade_max)) continue;
    const dealer = embeddedOne<{ profile_id: string }>(it.dealer);
    if (!dealer || dealer.profile_id === so.profile_id) continue; // never own listing

    // Don't double-offer: skip if this collector already offered on this item.
    const { data: existing } = await admin
      .from("offers")
      .select("id")
      .eq("inventory_item_id", it.id)
      .eq("from_profile_id", so.profile_id)
      .limit(1);
    if (existing?.length) continue;

    const { error } = await admin.from("offers").insert({
      inventory_item_id: it.id,
      from_profile_id: so.profile_id,
      to_profile_id: dealer.profile_id,
      price_cents: it.price_cents,
      message: "Standing offer (auto)",
    });
    if (!error) fired++;
  }
  return fired;
}

const SELECT = "id, profile_id, coin_type_id, max_price_cents, grade_min, grade_max";

/** Evaluate every active standing offer (daily cron). */
export async function evaluateStandingOffers(
  admin: SupabaseClient,
): Promise<{ fired: number }> {
  const { data: sos } = await admin
    .from("standing_offers")
    .select(SELECT)
    .eq("status", "active");
  let fired = 0;
  for (const so of (sos ?? []) as StandingOffer[]) {
    fired += await fireForStandingOffer(admin, so);
  }
  return { fired };
}

/** Evaluate standing offers for one coin type — used when a new coin lists. */
export async function evaluateStandingOffersForCoinType(
  admin: SupabaseClient,
  coinTypeId: string | null,
): Promise<void> {
  if (!coinTypeId) return;
  const { data: sos } = await admin
    .from("standing_offers")
    .select(SELECT)
    .eq("status", "active")
    .eq("coin_type_id", coinTypeId);
  for (const so of (sos ?? []) as StandingOffer[]) {
    await fireForStandingOffer(admin, so);
  }
}
