import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { toggleSave, makeOffer } from "@/app/(market)/actions";
import { Button } from "@/components/ui/button";
import { MessageSeller } from "@/components/message-seller";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export default async function MarketItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-out visitors can view a listing; a buyer profile only exists if
  // they're signed in.
  let profileId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    profileId = profile?.id ?? null;
  }

  const { data: item } = await supabase
    .from("inventory_items")
    .select("*, dealers(id, profile_id, business_name, location)")
    .eq("id", itemId)
    .single();

  if (!item || !item.is_public || item.status !== "listed") notFound();

  // A seller who opens their own listing gets the full management view
  // (price controls, activity, cost) instead of the buyer-facing page.
  const isMine = !!profileId && item.dealers?.profile_id === profileId;
  if (isMine) redirect(`/dealer/inventory/${itemId}`);

  // Count a view (the owner was already redirected away).
  if (user) {
    await supabase.rpc("increment_item_view", { p_item_id: itemId });
  }
  let isSaved = false;
  if (profileId) {
    const { data: saved } = await supabase
      .from("saved_items")
      .select("id")
      .eq("profile_id", profileId)
      .eq("inventory_item_id", itemId)
      .maybeSingle();
    isSaved = !!saved;
  }
  const photos: string[] = item.photos ?? [];

  // Buyer-facing "how this price moves" — safe, number-free, and only present
  // when the seller turned it on (the function enforces both).
  const { data: explainerRaw } = await supabase.rpc("price_explainer", {
    p_item_id: itemId,
  });
  const explainer = explainerRaw as {
    metal: string;
    spot_linked: boolean;
    uses_comp: boolean;
    demand_bump: boolean;
  } | null;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Marketplace
      </Link>

      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          {photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicPhotoUrl(photos[0])}
              alt=""
              className="aspect-square w-full rounded-xl border bg-muted object-contain"
            />
          ) : (
            <div className="aspect-square w-full rounded-xl border bg-muted" />
          )}
          {photos.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {photos.slice(1).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p}
                  src={publicPhotoUrl(p)}
                  alt=""
                  className="aspect-square w-full rounded-md border bg-muted object-contain"
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-semibold">{item.title || "Untitled coin"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gradeLabel(item)}
            {item.cert_number ? ` · Cert ${item.cert_number}` : ""}
          </p>
          <div className="mt-4 text-2xl font-semibold">
            {fmtMoney(item.price_cents)}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Sold by {item.dealers?.business_name || "a dealer"}
            {item.dealers?.location ? ` · ${item.dealers.location}` : ""}
          </p>

          {!user ? (
            <div className="mt-6 rounded-lg border p-4">
              <p className="text-sm font-medium">Interested in this coin?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to buy it, add it to your watchlist, or make an offer.
              </p>
              <Link href="/login" className="mt-3 inline-block">
                <Button>Sign in</Button>
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="flex gap-3">
                <Link href={`/checkout/buy/${item.id}`} className="flex-1">
                  <Button className="w-full">Buy now</Button>
                </Link>
                <form action={toggleSave}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="saved" value={isSaved ? "true" : "false"} />
                  <Button type="submit" variant="outline">
                    {isSaved ? "Watching ✓" : "Watch"}
                  </Button>
                </form>
              </div>

              <form action={makeOffer} className="space-y-2 rounded-lg border p-3">
                <div className="text-sm font-medium">Make an offer</div>
                <input type="hidden" name="item_id" value={item.id} />
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  required
                  placeholder="Your offer (USD)"
                  className={inputCls}
                />
                <input
                  name="message"
                  placeholder="Message (optional)"
                  className={inputCls}
                />
                <Button type="submit" variant="outline" className="w-full">
                  Send offer
                </Button>
              </form>

              <MessageSeller
                recipientId={item.dealers?.profile_id}
                itemId={item.id}
                sellerName={item.dealers?.business_name}
              />

              <Link
                href={`/wants/new?title=${encodeURIComponent(item.title || "")}`}
                className="block text-center text-sm text-muted-foreground underline hover:text-foreground"
              >
                Looking for one like this? Add to wants
              </Link>

              <p className="text-center text-xs text-muted-foreground">
                Demo marketplace — checkout is simulated; no real payment is taken.
              </p>
            </div>
          )}

          {explainer && (
            <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="font-medium">How this price moves</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {explainer.spot_linked && (
                  <li>
                    Linked to the live {explainer.metal} price — it updates
                    automatically as the market moves.
                  </li>
                )}
                {explainer.uses_comp && (
                  <li>Kept in line with recent sales of comparable coins.</li>
                )}
                {explainer.demand_bump && (
                  <li>May rise as interest in this coin grows.</li>
                )}
              </ul>
            </div>
          )}

          {item.description && (
            <p className="mt-6 whitespace-pre-line text-sm">{item.description}</p>
          )}
          {item.shipping_note && (
            <p className="mt-2 text-sm text-muted-foreground">
              Shipping: {item.shipping_note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
