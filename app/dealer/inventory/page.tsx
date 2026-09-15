import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";

const FILTERS = ["all", "listed", "unlisted", "reserved", "sold"] as const;

const STATUS_STYLES: Record<string, string> = {
  listed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  unlisted: "bg-muted text-muted-foreground",
  reserved: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  sold: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

export default async function DealerInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "all" } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const { data: dealer } = await supabase
    .from("dealers")
    .select("id")
    .eq("profile_id", profile!.id)
    .single();

  let query = supabase
    .from("inventory_items")
    .select(
      "id, title, grade, grading_service, designation, status, price_cents, photos, view_count",
    )
    .eq("dealer_id", dealer!.id)
    .order("updated_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);
  const { data: items } = await query;

  // Costs live in an owner-only companion table — look them up for these items.
  const ids = (items ?? []).map((i) => i.id);
  const costByItem = new Map<string, number | null>();
  if (ids.length) {
    const { data: costs } = await supabase
      .from("inventory_costs")
      .select("inventory_item_id, cost_cents")
      .in("inventory_item_id", ids);
    for (const c of costs ?? [])
      costByItem.set(c.inventory_item_id, c.cost_cents);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The coins you carry. New items start unlisted — list them from the
            Add form or the item page.
          </p>
        </div>
        <Link href="/dealer/inventory/new">
          <Button>Add item</Button>
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/dealer/inventory" : `/dealer/inventory?status=${f}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm capitalize",
              status === f
                ? "bg-foreground text-background"
                : "border text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
          </Link>
        ))}
      </div>

      {items && items.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Coin</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Views</th>
                <th className="px-3 py-2 font-medium">Rule</th>
                <th className="px-3 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {it.photos?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={publicPhotoUrl(it.photos[0])}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 shrink-0 rounded bg-muted" />
                      )}
                      <Link
                        href={`/dealer/inventory/${it.id}`}
                        className="font-medium hover:underline"
                      >
                        {it.title || "Untitled coin"}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2">{gradeLabel(it)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={it.status} />
                  </td>
                  <td className="px-3 py-2">
                    {fmtMoney(costByItem.get(it.id) ?? null)}
                  </td>
                  <td className="px-3 py-2">{fmtMoney(it.price_cents)}</td>
                  <td className="px-3 py-2">{it.view_count ?? 0}</td>
                  <td className="px-3 py-2 text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {status === "all"
            ? "No items yet. Click Add item to enter your first coin by hand."
            : `No ${status} items.`}
        </div>
      )}
    </div>
  );
}
