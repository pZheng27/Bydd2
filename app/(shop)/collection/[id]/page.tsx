import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { deleteCollectionItem, sellThisCoin } from "../actions";
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
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/collection" className="hover:underline">
          My Collection
        </Link>
        <span>/</span>
        <span className="truncate">{item.title || "Untitled coin"}</span>
      </div>

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

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
            <form action={sellThisCoin}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit">Sell this coin</Button>
            </form>
            <form action={deleteCollectionItem}>
              <input type="hidden" name="id" value={item.id} />
              <button className="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-muted">
                Remove
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            &ldquo;Sell this coin&rdquo; copies it into your dealer inventory as a
            draft — set a price and list it there.
          </p>
        </div>
      </div>
    </div>
  );
}
