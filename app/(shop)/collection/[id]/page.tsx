import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { CoinPhotos } from "@/components/coin-photos";
import { getCoinTypes } from "@/lib/catalog";
import { CatalogSelect } from "@/components/catalog-select";
import { deleteCollectionItem, linkCollectionItemToCatalog } from "../actions";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export default async function CollectionItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("collection_items")
    .select("*")
    .eq("id", id)
    .single();
  if (!item) notFound();

  let listedOnMarket = false;
  if (item.inventory_item_id) {
    const { data: inv } = await supabase
      .from("inventory_items")
      .select("status")
      .eq("id", item.inventory_item_id)
      .maybeSingle();
    listedOnMarket = inv?.status === "listed";
  }

  const coins = await getCoinTypes(supabase);
  const linkedCoin = item.coin_type_id
    ? coins.find((c) => c.id === item.coin_type_id)
    : undefined;

  const photos: string[] = item.photos ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/collection" className="hover:underline">
          My Collection
        </Link>
        <span>/</span>
        <span className="truncate">{item.title || "Untitled coin"}</span>
      </div>

      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        <CoinPhotos photos={photos} original={item.photos_original ?? []} />

        <div>
          <h1 className="text-2xl font-semibold">
            {item.title || "Untitled coin"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gradeLabel(item)}
            {item.cert_number ? ` · Cert ${item.cert_number}` : ""}
          </p>
          {listedOnMarket && (
            <div className="mt-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
              Listed on marketplace
            </div>
          )}

          {item.acquired_price_cents != null && (
            <div className="mt-4 text-sm">
              <span className="text-muted-foreground">You paid: </span>
              <span className="font-medium">
                {fmtMoney(item.acquired_price_cents)}
              </span>
            </div>
          )}

          {item.notes && (
            <div className="mt-4 text-sm">
              <div className="text-xs font-medium text-muted-foreground">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-line">{item.notes}</p>
            </div>
          )}

          {/* Catalog match — links the coin to the catalog so it counts in sets */}
          <div className="mt-5 rounded-xl border p-4">
            <div className="text-sm font-medium">Catalog match</div>
            {coins.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                The catalog has no coins yet.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {linkedCoin ? (
                    <>
                      Linked to{" "}
                      <span className="font-medium text-foreground">
                        {linkedCoin.name}
                      </span>
                      . This coin counts toward that set.
                    </>
                  ) : (
                    "Pick the catalog coin this is, so it counts toward your sets."
                  )}
                </p>
                <form
                  action={linkCollectionItemToCatalog}
                  className="mt-3 flex items-center gap-2"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <CatalogSelect
                    name="coin_type_id"
                    coins={coins}
                    defaultValue={item.coin_type_id}
                    className={inputCls}
                    blankLabel="— Not linked —"
                  />
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                </form>
              </>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
            <Link href={`/dealer/inventory/new?from=${item.id}`}>
              <Button>Sell this coin</Button>
            </Link>
            <form action={deleteCollectionItem}>
              <input type="hidden" name="id" value={item.id} />
              <button className="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-muted">
                Remove
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            &ldquo;Sell this coin&rdquo; opens the listing form with this coin&apos;s
            details filled in — set a price and it goes live.
          </p>
        </div>
      </div>
    </div>
  );
}
