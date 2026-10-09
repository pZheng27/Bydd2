import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { CoinDetail } from "@/components/coin-detail";
import { deleteCollectionItem } from "../actions";
import { Button } from "@/components/ui/button";

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

  const photos: string[] = item.photos ?? [];

  return (
    <CoinDetail
      crumbs={[{ href: "/collection", label: "My Collection" }]}
      title={item.title}
      grade={gradeLabel(item)}
      meta={item.cert_number ? ` · Cert ${item.cert_number}` : undefined}
      photos={photos}
      original={item.photos_original ?? []}
      description={item.notes}
      badge={
        <>
          {listedOnMarket && (
            <div className="mt-2 inline-block rounded-sm bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
              Listed on Marketplace
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
        </>
      }
    >
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
        <Link href={`/dealer/inventory/new?from=${item.id}`}>
          <Button>Sell this Coin</Button>
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
    </CoinDetail>
  );
}
