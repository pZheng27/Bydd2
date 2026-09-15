import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { setItemListed, deleteItem } from "@/app/dealer/inventory/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PricingPanel } from "@/components/pricing-panel";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", id)
    .single();
  if (!item) notFound();

  const { data: rule } = await supabase
    .from("pricing_rules")
    .select("params")
    .eq("inventory_item_id", id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const { data: spot } = await supabase
    .from("spot_prices")
    .select("price_cents_per_oz")
    .eq("metal", "gold")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const spotCents = spot?.price_cents_per_oz ?? null;

  const { data: events } = await supabase
    .from("agent_events")
    .select("id, kind, summary, created_at")
    .eq("inventory_item_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const listed = item.status === "listed";
  const photos: string[] = item.photos ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dealer/inventory" className="hover:underline">
          Inventory
        </Link>
        <span>/</span>
        <span className="truncate">{item.title || "Untitled coin"}</span>
      </div>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {item.title || "Untitled coin"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gradeLabel(item)}
            {item.cert_number ? ` · Cert ${item.cert_number}` : ""}
            {` · ${item.view_count ?? 0} view${item.view_count === 1 ? "" : "s"}`}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_STYLES[item.status] ?? "bg-muted text-muted-foreground",
          )}
        >
          {item.status}
        </span>
      </div>

      {photos.length > 0 ? (
        <div className="mt-4 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicPhotoUrl(photos[0])}
            alt=""
            className="mx-auto aspect-square w-full max-w-md rounded-xl border object-cover"
          />
          {photos.length > 1 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {photos.slice(1).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p}
                  src={publicPhotoUrl(p)}
                  alt=""
                  className="aspect-square w-full rounded-lg border object-cover"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No photos.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">Price</div>
          <div className="text-xl font-semibold">{fmtMoney(item.price_cents)}</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Your cost: {fmtMoney(item.cost_cents)}
          </div>
        </div>
        <div className="rounded-xl border p-4 text-sm">
          {item.description ? (
            <p>{item.description}</p>
          ) : (
            <p className="text-muted-foreground">No description.</p>
          )}
          {item.shipping_note && (
            <p className="mt-2 text-muted-foreground">
              Shipping: {item.shipping_note}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={setItemListed}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="listed" value={listed ? "false" : "true"} />
          <Button type="submit" variant={listed ? "outline" : "default"}>
            {listed ? "Unlist from marketplace" : "List on marketplace"}
          </Button>
        </form>
        <form action={deleteItem}>
          <input type="hidden" name="id" value={item.id} />
          <button className="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-muted">
            Delete item
          </button>
        </form>
      </div>

      <div className="mt-8">
        <PricingPanel item={item} rule={rule} spotCents={spotCents} />
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Panel title="Comps" note="Guide values and past sales arrive with the catalog (S5)." />
        <Panel title="Demand" note="Open wants vs. supply arrives once collectors join." />
      </div>
    </div>
  );
}
