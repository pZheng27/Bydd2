import type { SupabaseClient } from "@supabase/supabase-js";

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
