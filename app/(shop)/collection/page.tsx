import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { deleteCollectionItem } from "./actions";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  title: string | null;
  grade: number | null;
  designation: string | null;
  grading_service: string | null;
  cert_number: string | null;
  notes: string | null;
  photos: string[] | null;
  acquired_price_cents: number | null;
  inventory_item_id: string | null;
};

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: Item[] = [];
  const listedIds = new Set<string>();
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prof) {
      const { data: col } = await supabase
        .from("collections")
        .select("id")
        .eq("profile_id", prof.id)
        .maybeSingle();
      if (col) {
        const { data } = await supabase
          .from("collection_items")
          .select(
            "id, title, grade, designation, grading_service, cert_number, notes, photos, acquired_price_cents, inventory_item_id",
          )
          .eq("collection_id", col.id)
          .order("created_at", { ascending: false });
        items = (data as Item[]) ?? [];

        const invIds = items
          .map((i) => i.inventory_item_id)
          .filter((x): x is string => !!x);
        if (invIds.length) {
          const { data: invs } = await supabase
            .from("inventory_items")
            .select("id, status")
            .in("id", invIds);
          for (const iv of invs ?? [])
            if (iv.status === "listed") listedIds.add(iv.id);
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My Collection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The coins you own. Add them by hand for now — catalog import and set
            tracking arrive next session.
          </p>
        </div>
        <Link href="/collection/new">
          <Button>Add coin</Button>
        </Link>
      </div>

      {items.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.id} className="overflow-hidden rounded-xl border">
              <Link
                href={`/collection/${it.id}`}
                className="block hover:bg-muted/40"
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
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {gradeLabel(it)}
                    {it.cert_number ? ` · Cert ${it.cert_number}` : ""}
                  </div>
                  {it.inventory_item_id && listedIds.has(it.inventory_item_id) && (
                    <div className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                      Listed on marketplace
                    </div>
                  )}
                  {it.acquired_price_cents != null && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Paid {fmtMoney(it.acquired_price_cents)}
                    </div>
                  )}
                  {it.notes && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {it.notes}
                    </p>
                  )}
                </div>
              </Link>
              <div className="border-t px-3 py-2">
                <form action={deleteCollectionItem}>
                  <input type="hidden" name="id" value={it.id} />
                  <button className="text-xs text-muted-foreground underline hover:text-destructive">
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No coins yet. Click <span className="font-medium">Add coin</span> to
          enter your first one by hand.
        </div>
      )}
    </div>
  );
}
