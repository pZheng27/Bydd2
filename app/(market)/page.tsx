import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { cn } from "@/lib/utils";

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "price_asc", label: "Price ↑" },
  { key: "price_desc", label: "Price ↓" },
];

const inputCls =
  "rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function toCents(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

export default async function MarketplaceHome({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    min?: string;
    max?: string;
  }>;
}) {
  const { q = "", sort = "newest", min = "", max = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("inventory_items")
    .select("id, title, price_cents, photos, dealers(business_name)")
    .eq("is_public", true)
    .eq("status", "listed");

  if (q) query = query.ilike("title", `%${q}%`);
  const minCents = toCents(min);
  const maxCents = toCents(max);
  if (minCents != null) query = query.gte("price_cents", minCents);
  if (maxCents != null) query = query.lte("price_cents", maxCents);

  if (sort === "oldest")
    query = query.order("listed_at", { ascending: true, nullsFirst: false });
  else if (sort === "price_asc")
    query = query.order("price_cents", { ascending: true });
  else if (sort === "price_desc")
    query = query.order("price_cents", { ascending: false });
  else query = query.order("listed_at", { ascending: false, nullsFirst: false });

  const { data: items } = await query.limit(60);

  // Preserve the current filters when building the sort links.
  function sortHref(key: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    if (key !== "newest") params.set("sort", key);
    const s = params.toString();
    return `/${s ? `?${s}` : ""}`;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Marketplace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Coins listed by dealers. Open to everyone.
      </p>

      <form className="mt-4 flex flex-wrap items-center gap-2" action="/">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by title…"
          className={cn(inputCls, "w-full max-w-xs flex-1")}
        />
        <input
          name="min"
          type="number"
          min="0"
          step="1"
          defaultValue={min}
          placeholder="Min $"
          className={cn(inputCls, "w-24")}
        />
        <span className="text-sm text-muted-foreground">–</span>
        <input
          name="max"
          type="number"
          min="0"
          step="1"
          defaultValue={max}
          placeholder="Max $"
          className={cn(inputCls, "w-24")}
        />
        {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
        <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1">
        {SORTS.map((s) => (
          <Link
            key={s.key}
            href={sortHref(s.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              sort === s.key
                ? "bg-foreground text-background"
                : "border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {items && items.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`/market/${it.id}`}
              className="overflow-hidden rounded-xl border transition-shadow hover:shadow-sm"
            >
              {it.photos?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={publicPhotoUrl(it.photos[0])}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="aspect-square w-full bg-muted" />
              )}
              <div className="p-3">
                <div className="truncate text-sm font-medium">
                  {it.title || "Untitled coin"}
                </div>
                <div className="mt-0.5 text-sm">{fmtMoney(it.price_cents)}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {(it as { dealers?: { business_name?: string } }).dealers
                    ?.business_name ?? "Dealer"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No coins match your filters.
        </div>
      )}
    </div>
  );
}
