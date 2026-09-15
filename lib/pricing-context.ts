import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Effective gold spot in cents/oz: a per-browser dev test override (the
 * `test_gold_cents` cookie) wins over the latest DB spot. Shared by the pricing
 * preview, the reprice action, and the pricing chat so they all agree.
 */
export async function effectiveGoldCents(
  supabase: SupabaseClient,
): Promise<number | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("test_gold_cents")?.value;
  const o = raw ? Number(raw) : NaN;
  if (!Number.isNaN(o) && o > 0) return Math.round(o);
  const { data } = await supabase
    .from("spot_prices")
    .select("price_cents_per_oz")
    .eq("metal", "gold")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.price_cents_per_oz ?? null;
}

/**
 * Live demand signals for an item, gathered for both the price preview and the
 * reprice action so they always agree:
 *  - watches: how many buyers saved it (via the watch_count function, since
 *    other buyers' watchlists are RLS-protected).
 *  - compCents: the seller's own recent sales of a same-titled coin, averaged.
 * Views isn't fetched here — callers already have it on the loaded item.
 */
export async function itemSignals(
  supabase: SupabaseClient,
  opts: {
    itemId: string;
    itemTitle: string | null;
    sellerProfileId: string | null;
  },
): Promise<{ watches: number; compCents: number | null }> {
  const { data: wc } = await supabase.rpc("watch_count", {
    p_item_id: opts.itemId,
  });
  const watches = typeof wc === "number" ? wc : 0;

  let compCents: number | null = null;
  if (opts.sellerProfileId && opts.itemTitle) {
    const { data: sales } = await supabase
      .from("orders")
      .select("amount_cents, inventory_items!inner(title)")
      .eq("seller_profile_id", opts.sellerProfileId)
      .eq("inventory_items.title", opts.itemTitle)
      .order("created_at", { ascending: false })
      .limit(5);
    if (sales && sales.length > 0) {
      const total = sales.reduce(
        (sum: number, o: { amount_cents: number | null }) =>
          sum + (o.amount_cents ?? 0),
        0,
      );
      compCents = Math.round(total / sales.length);
    }
  }

  return { watches, compCents };
}
