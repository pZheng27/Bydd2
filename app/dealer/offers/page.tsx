import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { acceptOffer, declineOffer, counterOffer } from "@/app/dealer/offers/actions";
import { Button } from "@/components/ui/button";

export default async function DealerOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ accepted?: string; countered?: string; error?: string }>;
}) {
  const { accepted, countered, error } = await searchParams;
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
      "id, price_cents, message, status, created_at, inventory_items(id, title, photos)",
    )
    .eq("to_profile_id", profile!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Offers received</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Offers buyers have made on your coins. Accepting completes a{" "}
        <span className="font-medium">simulated</span> sale — no payment is taken.
      </p>

      {accepted && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          Offer accepted ✓ — the sale is in your Orders.
        </p>
      )}
      {countered && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          Counter sent ✓ — the buyer will see your new price.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {offers && offers.length > 0 ? (
        <div className="mt-4 space-y-3">
          {offers.map((o) => {
            const it = (
              o as {
                inventory_items?: {
                  id?: string;
                  title?: string;
                  photos?: string[];
                };
              }
            ).inventory_items;
            const pending = o.status === "pending";
            return (
              <div key={o.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-3">
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
                      {new Date(o.created_at).toLocaleDateString()} ·{" "}
                      <span className="capitalize">{o.status}</span>
                    </div>
                  </div>
                  <div className="text-lg font-semibold">
                    {fmtMoney(o.price_cents)}
                  </div>
                </div>
                {o.message && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    &ldquo;{o.message}&rdquo;
                  </p>
                )}
                {pending && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={acceptOffer}>
                      <input type="hidden" name="offer_id" value={o.id} />
                      <Button type="submit" size="sm">
                        Accept
                      </Button>
                    </form>
                    <form action={declineOffer}>
                      <input type="hidden" name="offer_id" value={o.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Decline
                      </Button>
                    </form>
                    <form action={counterOffer} className="flex items-center gap-1.5">
                      <input type="hidden" name="offer_id" value={o.id} />
                      <span className="text-sm text-muted-foreground">or</span>
                      <input
                        name="price"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Counter $"
                        className="w-28 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Counter
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No offers yet.
        </div>
      )}
    </div>
  );
}
