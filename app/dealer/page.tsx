import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { embeddedOne } from "@/lib/catalog";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type OrderRow = {
  amount_cents: number;
  created_at: string;
  inventory_items: { title: string | null } | { title: string | null }[] | null;
};

function Stat({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm font-medium">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border p-4 transition-colors hover:bg-muted">
      {inner}
    </Link>
  ) : (
    <div className="rounded-xl border p-4">{inner}</div>
  );
}

export default async function DealerHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .maybeSingle();
  const { data: dealer } = prof
    ? await supabase
        .from("dealers")
        .select("id, business_name")
        .eq("profile_id", prof.id)
        .maybeSingle()
    : { data: null };

  let listed = 0;
  let holdings = 0;
  let listedValue = 0;
  let salesCount = 0;
  let revenue = 0;
  let pendingOffers = 0;
  let openRequests = 0;
  let recentSales: OrderRow[] = [];

  if (prof && dealer) {
    const { data: inv } = await supabase
      .from("inventory_items")
      .select("status, price_cents")
      .eq("dealer_id", dealer.id);
    for (const i of inv ?? []) {
      if (i.status === "listed") {
        listed++;
        listedValue += i.price_cents ?? 0;
      } else if (i.status === "unlisted") {
        holdings++;
      }
    }

    const { data: orders } = await supabase
      .from("orders")
      .select("amount_cents, created_at, inventory_items(title)")
      .eq("seller_profile_id", prof.id)
      .order("created_at", { ascending: false });
    salesCount = (orders ?? []).length;
    revenue = (orders ?? []).reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    recentSales = ((orders ?? []) as OrderRow[]).slice(0, 5);

    const { data: offers } = await supabase
      .from("offers")
      .select("id")
      .eq("to_profile_id", prof.id)
      .eq("status", "pending");
    pendingOffers = (offers ?? []).length;

    const { data: reqs } = await supabase
      .from("requests")
      .select("status")
      .eq("dealer_id", dealer.id);
    openRequests = (reqs ?? []).filter(
      (r) => r.status === "sent" || r.status === "viewed",
    ).length;
  }

  const hasInventory = listed + holdings > 0 || salesCount > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {dealer?.business_name || "Dealer"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your seller dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dealer/inventory/import">
            <Button variant="outline">Import CSV</Button>
          </Link>
          <Link href="/dealer/inventory/new">
            <Button>Add coin</Button>
          </Link>
        </div>
      </div>

      {!hasInventory ? (
        <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No coins yet. Add your inventory by hand or import a CSV, then list
            coins on the marketplace.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/dealer/inventory/new">
              <Button>Add your first coin</Button>
            </Link>
            <Link href="/dealer/inventory/import">
              <Button variant="outline">Import CSV</Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Listed" value={listed} sub={`${fmtMoney(listedValue)} on the market`} href="/dealer/inventory" />
            <Stat label="Unlisted holdings" value={holdings} href="/dealer/inventory" />
            <Stat label="Sales" value={salesCount} sub={fmtMoney(revenue)} />
            <Stat
              label="Offers to review"
              value={pendingOffers}
              sub={pendingOffers ? "waiting on you" : undefined}
              href="/dealer/offers"
            />
            <Stat
              label="Open requests"
              value={openRequests}
              sub={openRequests ? "buyers looking" : undefined}
              href="/dealer/requests"
            />
            <Stat label="Demand" value="View" sub="what buyers want" href="/demand" />
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold">Recent sales</h2>
            {recentSales.length > 0 ? (
              <ul className="mt-2 divide-y rounded-xl border">
                {recentSales.map((o, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="truncate">
                      {embeddedOne<{ title: string | null }>(o.inventory_items)?.title ??
                        "Coin"}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-medium">{fmtMoney(o.amount_cents)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sales yet. Sales appear here once a buyer checks out or you
                accept an offer.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
