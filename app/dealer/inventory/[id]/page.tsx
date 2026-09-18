import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { itemSignals } from "@/lib/pricing-context";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import {
  setItemListed,
  deleteItem,
  setItemPrice,
} from "@/app/dealer/inventory/actions";
import {
  setWatchAuctions,
  checkAuctionsNow,
} from "@/app/dealer/inventory/watch-actions";
import { repriceItem } from "@/app/dealer/inventory/pricing-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ItemChat } from "@/components/item-chat";
import { aiConfigured } from "@/lib/anthropic";

const STATUS_STYLES: Record<string, string> = {
  listed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  unlisted: "bg-muted text-muted-foreground",
  reserved: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  sold: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

function Panel({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ listed?: string }>;
}) {
  const { id } = await params;
  const { listed: listedFlag } = await searchParams;
  const justListed = listedFlag === "1";
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", id)
    .single();
  if (!item) notFound();

  const { data: rule } = await supabase
    .from("pricing_rules")
    .select("id")
    .eq("inventory_item_id", id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const hasRule = !!rule;

  // Live demand signals (watch count shown in the header).
  const { data: dealer } = await supabase
    .from("dealers")
    .select("profile_id")
    .eq("id", item.dealer_id)
    .maybeSingle();
  const { watches } = await itemSignals(supabase, {
    itemId: id,
    itemTitle: item.title,
    sellerProfileId: dealer?.profile_id ?? null,
  });

  // Cost is private (owner-only companion table), not on the item row.
  const { data: costRow } = await supabase
    .from("inventory_costs")
    .select("cost_cents")
    .eq("inventory_item_id", id)
    .maybeSingle();
  const costCents = costRow?.cost_cents ?? null;

  const { data: events } = await supabase
    .from("agent_events")
    .select("id, kind, summary, created_at")
    .eq("inventory_item_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: chatRows } = await supabase
    .from("agent_chat_messages")
    .select("role, content")
    .eq("inventory_item_id", id)
    .order("created_at", { ascending: true })
    .limit(50);
  const chatHistory = (chatRows ?? []).map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content as string,
  }));

  const { data: watchHits } = await supabase
    .from("auction_watch_hits")
    .select("id, lot_title, price_text, auction_house, sale_date_text, url, found_at")
    .eq("inventory_item_id", id)
    .order("found_at", { ascending: false })
    .limit(10);

  const listed = item.status === "listed";
  const photos: string[] = item.photos ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dealer/inventory" className="hover:underline">
          Inventory
        </Link>
        <span>/</span>
        <span className="truncate">{item.title || "Untitled coin"}</span>
      </div>

      {justListed && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <div className="text-sm font-medium text-green-800 dark:text-green-300">
            ✓ Listed on the marketplace
          </div>
          <p className="mt-1 text-sm text-green-800/80 dark:text-green-300/80">
            Your coin is now live for buyers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/dealer/inventory/${item.id}`}>
              <Button size="sm">View item</Button>
            </Link>
            <Link href="/dealer/inventory">
              <Button size="sm" variant="outline">
                Return to inventory
              </Button>
            </Link>
            <Link href="/dealer/inventory/new">
              <Button size="sm" variant="outline">
                List another
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          {photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicPhotoUrl(photos[0])}
              alt=""
              className="aspect-square w-full rounded-xl border object-cover"
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
                  className="aspect-square w-full rounded-md border object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold">
              {item.title || "Untitled coin"}
            </h1>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_STYLES[item.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {item.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {gradeLabel(item)}
            {item.cert_number ? ` · Cert ${item.cert_number}` : ""}
          </p>

          <div className="mt-4 text-2xl font-semibold">
            {fmtMoney(item.price_cents)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your cost: {fmtMoney(costCents)}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {item.view_count ?? 0} view{item.view_count === 1 ? "" : "s"}
            </span>
            <span>{watches} watching</span>
          </div>

          <div className="mt-4 text-sm">
            {item.description ? (
              <p className="whitespace-pre-line">{item.description}</p>
            ) : (
              <p className="text-muted-foreground">No description.</p>
            )}
            {item.shipping_note && (
              <p className="mt-2 text-muted-foreground">
                Shipping: {item.shipping_note}
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <form action={deleteItem}>
              <input type="hidden" name="id" value={item.id} />
              <button className="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-muted">
                Delete item
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div className="rounded-xl border p-4">
          <form action={setItemListed}>
            <input type="hidden" name="id" value={item.id} />
            <input
              type="hidden"
              name="listed"
              value={listed ? "false" : "true"}
            />
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label htmlFor="price" className="text-sm font-medium">
                  Price (USD)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="price"
                    name="price"
                    type="number"
                    step="0.01"
                    defaultValue={
                      item.price_cents ? (item.price_cents / 100).toFixed(2) : ""
                    }
                    placeholder="e.g. 3500.00"
                    className="w-40 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    formAction={setItemPrice}
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Save price
                  </button>
                </div>
              </div>
              <Button type="submit" variant={listed ? "outline" : "default"}>
                {listed ? "Unlist from marketplace" : "List on marketplace"}
              </Button>
            </div>
          </form>
          {!listed && (
            <p className="mt-2 text-xs text-muted-foreground">
              This coin isn&apos;t live yet — type your price, then click{" "}
              <span className="font-medium">List on marketplace</span> (it saves
              the price automatically).
            </p>
          )}
        </div>

        {hasRule && (
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Automatic reprice</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Recompute this coin&apos;s price from the spot-linked rule the
                  assistant set, using the current metal price.
                </p>
              </div>
              <form action={repriceItem}>
                <input type="hidden" name="item_id" value={item.id} />
                <Button type="submit" size="sm" variant="outline">
                  Reprice now
                </Button>
              </form>
            </div>
          </div>
        )}

        <ItemChat itemId={id} initial={chatHistory} configured={aiConfigured()} />
      </div>

      <div className="mt-4 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Auction watch</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Weekly, we scan Numisbids for comparable coins coming to auction and
              alert you.
            </p>
          </div>
          <form action={setWatchAuctions}>
            <input type="hidden" name="item_id" value={item.id} />
            <input
              type="hidden"
              name="on"
              value={item.watch_auctions ? "false" : "true"}
            />
            <Button
              type="submit"
              size="sm"
              variant={item.watch_auctions ? "outline" : "default"}
            >
              {item.watch_auctions ? "Watching ✓ — turn off" : "Watch auctions"}
            </Button>
          </form>
        </div>
        {item.watch_auctions && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-3">
              <form action={checkAuctionsNow}>
                <input type="hidden" name="item_id" value={item.id} />
                <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                  Check now
                </button>
              </form>
              <span className="text-xs text-muted-foreground">
                {item.auctions_checked_at
                  ? `Last checked ${new Date(item.auctions_checked_at).toLocaleString()}`
                  : "Not checked yet"}
              </span>
            </div>
            {watchHits && watchHits.length > 0 ? (
              <ul className="mt-3 divide-y rounded-lg border">
                {watchHits.map((h) => (
                  <li key={h.id} className="px-3 py-2 text-sm">
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      {h.lot_title}
                    </a>
                    <div className="text-xs text-muted-foreground">
                      {[h.price_text, h.auction_house, h.sale_date_text]
                        .filter(Boolean)
                        .join(" · ") || "upcoming lot"}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No comparable upcoming lots found yet. Click &ldquo;Check
                now&rdquo; to scan.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border p-4">
        <div className="text-sm font-medium">Activity</div>
        {events && events.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()} ·{" "}
                </span>
                {e.summary}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No activity yet. Set a rule and click Reprice now.
          </p>
        )}
      </div>

      <div className="mt-4">
        <Panel title="Demand" note="Open wants vs. supply arrives once collectors join." />
      </div>
    </div>
  );
}
