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

export default async function CollectorHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .maybeSingle();
  const { data: col } = prof
    ? await supabase
        .from("collections")
        .select("id")
        .eq("profile_id", prof.id)
        .maybeSingle()
    : { data: null };

  let coinsOwned = 0;
  let setsCount = 0;
  let ownedSlots = 0;
  let totalSlots = 0;
  let openWants = 0;
  let saved = 0;
  let purchases = 0;
  let recentOrders: OrderRow[] = [];

  if (prof) {
    if (col) {
      const { data: items } = await supabase
        .from("collection_items")
        .select("coin_type_id")
        .eq("collection_id", col.id);
      coinsOwned = (items ?? []).length;
      const ownedCoinTypes = new Set(
        (items ?? []).map((i) => i.coin_type_id).filter(Boolean),
      );

      const { data: sets } = await supabase
        .from("collection_sets")
        .select("id, source_set_id")
        .eq("collection_id", col.id);
      setsCount = (sets ?? []).length;
      const seriesIds = (sets ?? [])
        .filter((s) => s.source_set_id)
        .map((s) => s.id);
      if (seriesIds.length) {
        const { data: members } = await supabase
          .from("collection_set_members")
          .select("coin_type_id")
          .in("collection_set_id", seriesIds);
        totalSlots = (members ?? []).length;
        ownedSlots = (members ?? []).filter((m) =>
          ownedCoinTypes.has(m.coin_type_id),
        ).length;
      }
    }

    const { data: wants } = await supabase
      .from("wants")
      .select("id")
      .eq("profile_id", prof.id)
      .eq("status", "open");
    openWants = (wants ?? []).length;

    const { data: sav } = await supabase
      .from("saved_items")
      .select("id")
      .eq("profile_id", prof.id);
    saved = (sav ?? []).length;

    const { data: orders } = await supabase
      .from("orders")
      .select("amount_cents, created_at, inventory_items(title)")
      .eq("buyer_profile_id", prof.id)
      .order("created_at", { ascending: false });
    purchases = (orders ?? []).length;
    recentOrders = ((orders ?? []) as OrderRow[]).slice(0, 5);
  }

  const empty =
    coinsOwned === 0 &&
    setsCount === 0 &&
    openWants === 0 &&
    saved === 0 &&
    purchases === 0;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">Collector</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your collecting dashboard. Browse coins on the{" "}
        <Link href="/" className="underline">
          marketplace
        </Link>
        .
      </p>

      {/* Buyer agent — now a docked chat, bottom-right */}
      <div className="mt-6 rounded-xl border bg-muted/30 p-4">
        <div className="font-medium">Buyer agent</div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Open the <span className="font-medium">💬 Buyer agent</span> chat in the
          bottom-right corner anytime — tell it what you&apos;re missing and it
          finds coins to fill your gaps and drafts offers for you to confirm.
        </p>
      </div>

      {empty ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Start by building a set (like the Carson City Morgans) or adding
            coins you already own.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/collection/sets/new">
              <Button>Build a set</Button>
            </Link>
            <Link href="/collection/new">
              <Button variant="outline">Add a coin</Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Set completion"
              value={totalSlots > 0 ? `${ownedSlots}/${totalSlots}` : "—"}
              sub={
                totalSlots > 0
                  ? "coins across your checklist sets"
                  : "make a checklist set"
              }
              href="/collection"
            />
            <Stat label="Coins owned" value={coinsOwned} href="/collection" />
            <Stat
              label="Open wants"
              value={openWants}
              sub={openWants ? "being routed to dealers" : undefined}
              href="/wants"
            />
            <Stat label="Saved" value={saved} href="/saved" />
            <Stat label="Purchases" value={purchases} href="/orders" />
            <Stat label="Sets" value={setsCount} href="/collection" />
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold">Recent purchases</h2>
            {recentOrders.length > 0 ? (
              <ul className="mt-2 divide-y rounded-xl border">
                {recentOrders.map((o, i) => (
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
                No purchases yet.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
