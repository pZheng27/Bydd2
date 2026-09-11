import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string }>;
}) {
  const { purchased } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const myId = profile?.id;

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, amount_cents, kind, created_at, buyer_profile_id, seller_profile_id, inventory_items(title, photos)",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Orders</h1>
      {purchased && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          Purchase complete ✓ (simulated — no funds moved)
        </p>
      )}
      {orders && orders.length > 0 ? (
        <div className="mt-4 space-y-3">
          {orders.map((o) => {
            const bought = o.buyer_profile_id === myId;
            const it = (o as { inventory_items?: { title?: string; photos?: string[] } })
              .inventory_items;
            return (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl border p-3"
              >
                {it?.photos?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicPhotoUrl(it.photos[0])}
                    alt=""
                    className="h-12 w-12 rounded-md border object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted" />
                )}
                <div className="flex-1">
                  <div className="font-medium">{it?.title ?? "Coin"}</div>
                  <div className="text-xs text-muted-foreground">
                    {bought ? "Bought" : "Sold"} ·{" "}
                    {new Date(o.created_at).toLocaleDateString()} ·{" "}
                    {o.kind === "buy_now" ? "Buy now" : "Offer"}
                  </div>
                </div>
                <div className="font-semibold">{fmtMoney(o.amount_cents)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No orders yet. Buy a coin from the{" "}
          <Link href="/market" className="underline">
            marketplace
          </Link>
          .
        </div>
      )}
    </div>
  );
}
