import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCoinTypes,
  groupBySeries,
  embeddedOne,
  type CoinType,
} from "@/lib/catalog";
import { gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import {
  renameCollectionSet,
  deleteCollectionSet,
  addCoinsToSet,
  removeCoinFromSet,
  addOwnCoinsToSet,
  removeOwnCoinFromSet,
} from "../actions";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

type SlotCoin = { id: string; name: string; year: number | null };
type SlotRow = { sort_order: number | null; coin_type: SlotCoin | SlotCoin[] | null };

type OwnItem = {
  id: string;
  title: string | null;
  grade: number | null;
  designation: string | null;
  grading_service: string | null;
  photos: string[] | null;
};
type OwnRow = { sort_order: number | null; collection_item: OwnItem | OwnItem[] | null };

export default async function ManageSetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("collection_sets")
    .select("id, name, source_set_id")
    .eq("id", id)
    .maybeSingle();
  if (!set) notFound();

  const isSeries = !!set.source_set_id;

  // Series set → catalog slots (owned/missing checklist).
  let seriesMembers: SlotCoin[] = [];
  let addableCatalog: CoinType[] = [];
  // Freeform set → the collector's own coins.
  let ownCoins: OwnItem[] = [];
  let addableOwn: OwnItem[] = [];

  if (isSeries) {
    const { data: memberRows } = await supabase
      .from("collection_set_members")
      .select("sort_order, coin_type:coin_types(id, name, year)")
      .eq("collection_set_id", id);
    seriesMembers = (((memberRows ?? []) as unknown as SlotRow[]) ?? [])
      .map((m) => ({ sort_order: m.sort_order, ct: embeddedOne<SlotCoin>(m.coin_type) }))
      .filter((m): m is { sort_order: number | null; ct: SlotCoin } => !!m.ct)
      .sort((a, b) => {
        const sa = a.sort_order ?? Number.POSITIVE_INFINITY;
        const sb = b.sort_order ?? Number.POSITIVE_INFINITY;
        if (sa !== sb) return sa - sb;
        return a.ct.name.localeCompare(b.ct.name);
      })
      .map((m) => m.ct);
    const inSet = new Set(seriesMembers.map((c) => c.id));
    const catalog = await getCoinTypes(supabase);
    addableCatalog = catalog.filter((c) => !inSet.has(c.id));
  } else {
    const { data: rows } = await supabase
      .from("collection_set_coins")
      .select(
        "sort_order, collection_item:collection_items(id, title, grade, designation, grading_service, photos)",
      )
      .eq("collection_set_id", id);
    ownCoins = (((rows ?? []) as unknown as OwnRow[]) ?? [])
      .map((r) => ({ sort_order: r.sort_order, item: embeddedOne<OwnItem>(r.collection_item) }))
      .filter((r): r is { sort_order: number | null; item: OwnItem } => !!r.item)
      .sort((a, b) => {
        const sa = a.sort_order ?? Number.POSITIVE_INFINITY;
        const sb = b.sort_order ?? Number.POSITIVE_INFINITY;
        return sa - sb;
      })
      .map((r) => r.item);

    const inSet = new Set(ownCoins.map((c) => c.id));
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
          const { data: all } = await supabase
            .from("collection_items")
            .select("id, title, grade, designation, grading_service, photos")
            .eq("collection_id", col.id)
            .order("created_at", { ascending: false });
          addableOwn = ((all as OwnItem[]) ?? []).filter((c) => !inSet.has(c.id));
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/collection" className="hover:underline">
          My Collection
        </Link>
        <span>/</span>
        <Link href={`/collection?set=${set.id}`} className="hover:underline">
          {set.name}
        </Link>
        <span>/</span>
        <span>Manage</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manage set</h1>
          <p className="text-sm text-muted-foreground">
            {isSeries
              ? "Series set — tracks owned vs. missing coins from the catalog."
              : "Freeform set — holds the coins you pick from your collection."}
          </p>
        </div>
        <Link href={`/collection?set=${set.id}`}>
          <Button variant="outline">View grid</Button>
        </Link>
      </div>

      {/* Rename */}
      <form
        action={renameCollectionSet}
        className="mt-6 flex items-end gap-3 rounded-xl border p-4"
      >
        <input type="hidden" name="id" value={set.id} />
        <div className="flex-1 space-y-1.5">
          <label className="text-sm font-medium" htmlFor="name">
            Set name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={set.name}
            className={inputCls}
          />
        </div>
        <Button type="submit">Save</Button>
      </form>

      {isSeries ? (
        <SeriesManager
          setId={set.id}
          members={seriesMembers}
          addable={addableCatalog}
        />
      ) : (
        <FreeformManager
          setId={set.id}
          coins={ownCoins}
          addable={addableOwn}
        />
      )}

      {/* Delete set */}
      <div className="mt-8 border-t pt-4">
        <form action={deleteCollectionSet}>
          <input type="hidden" name="id" value={set.id} />
          <button className="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-muted">
            Delete this set
          </button>
        </form>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Deleting a set only removes the grouping — the coins you own stay in
          your collection.
        </p>
      </div>
    </div>
  );
}

/** Catalog-slot management for a series set. */
function SeriesManager({
  setId,
  members,
  addable,
}: {
  setId: string;
  members: SlotCoin[];
  addable: CoinType[];
}) {
  return (
    <>
      <div className="mt-6">
        <h2 className="text-sm font-semibold">
          Coins in this set{" "}
          <span className="font-normal text-muted-foreground">
            ({members.length})
          </span>
        </h2>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No coins yet. Add some below.
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-xl border">
            {members.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-sm">{c.name}</span>
                <form action={removeCoinFromSet}>
                  <input type="hidden" name="set_id" value={setId} />
                  <input type="hidden" name="coin_type_id" value={c.id} />
                  <button className="text-xs text-muted-foreground underline hover:text-destructive">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Add coins from the catalog</h2>
        {addable.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Every catalog coin is already in this set.
          </p>
        ) : (
          <form action={addCoinsToSet} className="mt-2 space-y-4">
            <input type="hidden" name="set_id" value={setId} />
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border p-4">
              {groupBySeries(addable).map(([series, list]) => (
                <div key={series}>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {series}
                  </div>
                  <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {list.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          name="coin_type_id"
                          value={c.id}
                          className="h-4 w-4"
                        />
                        <span>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button type="submit">Add selected</Button>
          </form>
        )}
      </div>
    </>
  );
}

/** Own-coin management for a freeform set. */
function FreeformManager({
  setId,
  coins,
  addable,
}: {
  setId: string;
  coins: OwnItem[];
  addable: OwnItem[];
}) {
  return (
    <>
      <div className="mt-6">
        <h2 className="text-sm font-semibold">
          Coins in this set{" "}
          <span className="font-normal text-muted-foreground">
            ({coins.length})
          </span>
        </h2>
        {coins.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No coins yet. Add some from your collection below.
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-xl border">
            {coins.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="flex items-center gap-3">
                  <Thumb photo={c.photos?.[0]} />
                  <span>
                    <span className="block text-sm">
                      {c.title || "Untitled coin"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {gradeLabel(c)}
                    </span>
                  </span>
                </span>
                <form action={removeOwnCoinFromSet}>
                  <input type="hidden" name="set_id" value={setId} />
                  <input type="hidden" name="collection_item_id" value={c.id} />
                  <button className="text-xs text-muted-foreground underline hover:text-destructive">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Add coins from your collection</h2>
        {addable.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {coins.length === 0
              ? "You have no coins yet. Add coins to your collection first."
              : "All your coins are already in this set."}
          </p>
        ) : (
          <form action={addOwnCoinsToSet} className="mt-2 space-y-4">
            <input type="hidden" name="set_id" value={setId} />
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-3">
              {addable.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    name="collection_item_id"
                    value={c.id}
                    className="h-4 w-4"
                  />
                  <Thumb photo={c.photos?.[0]} />
                  <span>
                    <span className="block">{c.title || "Untitled coin"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {gradeLabel(c)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <Button type="submit">Add selected</Button>
          </form>
        )}
      </div>
    </>
  );
}

function Thumb({ photo }: { photo?: string | null }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={publicPhotoUrl(photo)}
        alt=""
        className="h-8 w-8 shrink-0 rounded object-cover"
      />
    );
  }
  return <span className="h-8 w-8 shrink-0 rounded bg-muted" />;
}
