import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";

export default async function OffersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  const { data: offers } = await supabase
    .from("offers")
    .select(
      "id, price_cents, status, created_at, inventory_item_id, inventory_items(title)",
    )
    .eq("from_profile_id", profile!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Your offers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Offers you&apos;ve sent to sellers.
      </p>
      {offers && offers.length > 0 ? (
        <div className="mt-4 space-y-2">
          {offers.map((o) => {
            const it = (o as { inventory_items?: { title?: string } })
              .inventory_items;
            return (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
              >
                <div>
                  <Link
                    href={`/market/${o.inventory_item_id}`}
                    className="font-medium hover:underline"
                  >
                    {it?.title ?? "Coin"}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtMoney(o.price_cents)}</div>
                  <div className="text-xs capitalize text-muted-foreground">
                    {o.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No offers yet. Make one from a listing.
        </div>
      )}
    </div>
  );
}
