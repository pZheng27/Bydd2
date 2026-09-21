import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { embeddedOne } from "@/lib/catalog";
import { acceptCounter, declineCounter } from "./actions";
import { Button } from "@/components/ui/button";

type OfferRow = {
  id: string;
  price_cents: number;
  status?: string;
  created_at: string;
  inventory_item_id: string;
  inventory_items: { title: string | null } | { title: string | null }[] | null;
};

const title = (o: OfferRow) =>
  embeddedOne<{ title: string | null }>(o.inventory_items)?.title ?? "Coin";

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ accepted?: string; error?: string }>;
}) {
  const { accepted, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  const [{ data: sentD }, { data: receivedD }] = await Promise.all([
    supabase
      .from("offers")
      .select(
        "id, price_cents, status, created_at, inventory_item_id, inventory_items(title)",
      )
      .eq("from_profile_id", profile!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("offers")
      .select(
        "id, price_cents, created_at, inventory_item_id, inventory_items(title)",
      )
      .eq("to_profile_id", profile!.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  const sent = (sentD as OfferRow[]) ?? [];
  const received = (receivedD as OfferRow[]) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Your offers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Offers you&apos;ve sent, and counters from sellers to review.
      </p>

      {accepted && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          Deal done ✓ — it&apos;s in your Orders.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {received.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold">Counters to review</h2>
          <div className="mt-2 space-y-3">
            {received.map((o) => (
              <div key={o.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/market/${o.inventory_item_id}`}
                    className="font-medium hover:underline"
                  >
                    {title(o)}
                  </Link>
                  <div className="text-lg font-semibold">
                    {fmtMoney(o.price_cents)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Seller countered at this price.
                </div>
                <div className="mt-3 flex gap-2">
                  <form action={acceptCounter}>
                    <input type="hidden" name="offer_id" value={o.id} />
                    <Button type="submit" size="sm">
                      Accept &amp; buy
                    </Button>
                  </form>
                  <form action={declineCounter}>
                    <input type="hidden" name="offer_id" value={o.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Decline
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold">Sent</h2>
      {sent.length > 0 ? (
        <div className="mt-2 space-y-2">
          {sent.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <div>
                <Link
                  href={`/market/${o.inventory_item_id}`}
                  className="font-medium hover:underline"
                >
                  {title(o)}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{fmtMoney(o.price_cents)}</div>
                <div className="text-xs capitalize text-muted-foreground">
                  {o.status === "countered" ? "countered" : o.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No offers yet. Make one from a listing.
        </div>
      )}
    </div>
  );
}
