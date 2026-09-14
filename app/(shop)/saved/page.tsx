import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  const { data: saved } = await supabase
    .from("saved_items")
    .select(
      "id, inventory_item_id, inventory_items(id, title, price_cents, photos, status, is_public)",
    )
    .eq("profile_id", profile!.id)
    .order("created_at", { ascending: false });

  // Hide coins you've already bought.
  const { data: myOrders } = await supabase
    .from("orders")
    .select("inventory_item_id")
    .eq("buyer_profile_id", profile!.id);
  const boughtIds = new Set((myOrders ?? []).map((o) => o.inventory_item_id));
  const items = (saved ?? []).filter(
    (s) => !boughtIds.has((s as { inventory_item_id?: string }).inventory_item_id),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Saved</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your watchlist of coins.</p>
      {items.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((s) => {
            const it = (
              s as {
                inventory_items?: {
                  id?: string;
                  title?: string;
                  price_cents?: number;
                  photos?: string[];
                  status?: string;
                  is_public?: boolean;
                };
              }
            ).inventory_items;
            const available = it && it.is_public && it.status === "listed";
            return (
              <div key={s.id} className="overflow-hidden rounded-xl border">
                {it?.photos?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicPhotoUrl(it.photos[0])}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-muted" />
                )}
                <div className="p-3">
                  <div className="truncate text-sm font-medium">
                    {it?.title ?? "Coin"}
                  </div>
                  <div className="text-sm">{fmtMoney(it?.price_cents)}</div>
                  {available ? (
                    <Link
                      href={`/market/${it!.id}`}
                      className="mt-1 inline-block text-xs underline"
                    >
                      View
                    </Link>
                  ) : (
                    <div className="mt-1 text-xs text-muted-foreground">
                      No longer available
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No saved coins yet. Tap <span className="font-medium">Save</span> on any
          listing.
        </div>
      )}
    </div>
  );
}
