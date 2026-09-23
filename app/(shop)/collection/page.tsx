import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { embeddedOne } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SetChecklist, type ChecklistTile } from "@/components/set-checklist";

type CustomSet = { id: string; name: string; source_set_id: string | null };

type SlotCoin = {
  id: string;
  name: string;
  year: number | null;
  mintmark: string | null;
  series: string;
};

type MemberRow = {
  sort_order: number | null;
  coin_type: SlotCoin | SlotCoin[] | null;
};

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const { set: setParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let sets: CustomSet[] = [];
  let collectionId: string | null = null;

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
        collectionId = col.id;
        const { data: setRows } = await supabase
          .from("collection_sets")
          .select("id, name, source_set_id")
          .eq("collection_id", col.id)
          .order("created_at", { ascending: true });
        sets = (setRows as CustomSet[]) ?? [];
      }
    }
  }

  // No "All coins" view — the collection is organized entirely by sets.
  const activeSet = (setParam && sets.find((s) => s.id === setParam)) || sets[0];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My Collection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize your coins into sets and track which ones you still need.
          </p>
        </div>
        <Link href="/collection/new">
          <Button>Add coin</Button>
        </Link>
      </div>

      {sets.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No sets yet. A set is a group of coins — like the Carson City
            Morgans — that shows what you own and what you&apos;re still missing.
          </p>
          <Link href="/collection/sets/new" className="mt-4 inline-block">
            <Button>Build your first set</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Set switcher: one tab per set + New set */}
          <div className="mt-5 flex flex-wrap items-center gap-1 border-b">
            {sets.map((s) => (
              <SetTab
                key={s.id}
                href={`/collection?set=${s.id}`}
                active={activeSet?.id === s.id}
              >
                {s.name}
              </SetTab>
            ))}
            <Link
              href="/collection/sets/new"
              className="ml-1 whitespace-nowrap px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              + New set
            </Link>
          </div>

          {activeSet &&
            (activeSet.source_set_id ? (
              <SetGrid
                supabase={supabase}
                collectionId={collectionId}
                setId={activeSet.id}
                setName={activeSet.name}
              />
            ) : (
              <CustomSetGrid
                supabase={supabase}
                setId={activeSet.id}
                setName={activeSet.name}
              />
            ))}
        </>
      )}
    </div>
  );
}

function SetTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

type OwnItem = {
  id: string;
  title: string | null;
  grade: number | null;
  designation: string | null;
  grading_service: string | null;
  photos: string[] | null;
};

type OwnCoinRow = { sort_order: number | null; collection_item: OwnItem | OwnItem[] | null };

/**
 * A freeform set: the specific coins the collector dropped into it, shown as a
 * plain photo grid. No catalog checklist and no "missing" tiles.
 */
async function CustomSetGrid({
  supabase,
  setId,
  setName,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  setId: string;
  setName: string;
}) {
  const { data: rows } = await supabase
    .from("collection_set_coins")
    .select(
      "sort_order, collection_item:collection_items(id, title, grade, designation, grading_service, photos)",
    )
    .eq("collection_set_id", setId);

  const coins = (((rows ?? []) as unknown as OwnCoinRow[]) ?? [])
    .map((r) => ({ sort_order: r.sort_order, item: embeddedOne<OwnItem>(r.collection_item) }))
    .filter((r): r is { sort_order: number | null; item: OwnItem } => !!r.item)
    .sort((a, b) => {
      const sa = a.sort_order ?? Number.POSITIVE_INFINITY;
      const sb = b.sort_order ?? Number.POSITIVE_INFINITY;
      return sa - sb;
    })
    .map((r) => r.item);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{setName}</h2>
          <p className="text-sm text-muted-foreground">
            {coins.length === 1 ? "1 coin" : `${coins.length} coins`}
          </p>
        </div>
        <Link
          href={`/collection/sets/${setId}`}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Manage set
        </Link>
      </div>

      {coins.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          This set has no coins yet.{" "}
          <Link href={`/collection/sets/${setId}`} className="underline">
            Add coins from your collection
          </Link>
          .
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {coins.map((it) => (
            <Link
              key={it.id}
              href={`/collection/${it.id}`}
              className="overflow-hidden rounded-xl border transition-colors hover:bg-muted/40"
            >
              {it.photos?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={publicPhotoUrl(it.photos[0])}
                  alt={it.title ?? ""}
                  className="aspect-square w-full bg-muted object-contain"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  No photo
                </div>
              )}
              <div className="p-2">
                <div className="truncate text-xs font-medium">
                  {it.title || "Untitled coin"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {gradeLabel(it)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type OwnedCoin = { id: string; label: string; photo: string | null };

/**
 * The set-completion grid: every coin in the set as a tile. Owned coins show
 * the photo you uploaded (and link to the coin); missing coins are a gap with a
 * one-click "Add to wants".
 */
async function SetGrid({
  supabase,
  collectionId,
  setId,
  setName,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  collectionId: string | null;
  setId: string;
  setName: string;
}) {
  const { data: memberRows } = await supabase
    .from("collection_set_members")
    .select(
      "sort_order, coin_type:coin_types(id, name, year, mintmark, series)",
    )
    .eq("collection_set_id", setId);

  const members = (((memberRows ?? []) as unknown as MemberRow[]) ?? [])
    .map((m) => ({ sort_order: m.sort_order, ct: embeddedOne<SlotCoin>(m.coin_type) }))
    .filter((m): m is { sort_order: number | null; ct: SlotCoin } => !!m.ct)
    .sort((a, b) => {
      const sa = a.sort_order ?? Number.POSITIVE_INFINITY;
      const sb = b.sort_order ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      return a.ct.name.localeCompare(b.ct.name);
    })
    .map((m) => m.ct);

  const coinTypeIds = members.map((c) => c.id);

  // Which slots the collector owns (any collection item linked to that coin).
  const owned = new Map<string, OwnedCoin>();
  if (collectionId && coinTypeIds.length) {
    const { data: mine } = await supabase
      .from("collection_items")
      .select("id, grade, designation, grading_service, photos, coin_type_id")
      .eq("collection_id", collectionId)
      .in("coin_type_id", coinTypeIds);
    for (const it of mine ?? []) {
      if (it.coin_type_id && !owned.has(it.coin_type_id)) {
        owned.set(it.coin_type_id, {
          id: it.id,
          label: gradeLabel(it),
          photo: it.photos?.[0] ?? null,
        });
      }
    }
  }

  // Missing slots that already have an open want, so we don't double-prompt.
  const wanted = new Set<string>();
  if (coinTypeIds.length) {
    const { data: w } = await supabase
      .from("wants")
      .select("coin_type_id")
      .eq("status", "open")
      .in("coin_type_id", coinTypeIds);
    for (const row of w ?? []) if (row.coin_type_id) wanted.add(row.coin_type_id);
  }

  const ownedCount = members.filter((c) => owned.has(c.id)).length;
  const total = members.length;
  const pct = total ? Math.round((ownedCount / total) * 100) : 0;

  const tiles: ChecklistTile[] = members.map((c) => {
    const own = owned.get(c.id);
    if (own) {
      return {
        id: c.id,
        name: c.name,
        owned: true,
        photoUrl: own.photo ? publicPhotoUrl(own.photo) : null,
        label: own.label,
        itemHref: `/collection/${own.id}`,
        wanted: false,
        wantHref: "",
      };
    }
    return {
      id: c.id,
      name: c.name,
      owned: false,
      photoUrl: null,
      label: "",
      itemHref: "",
      wanted: wanted.has(c.id),
      wantHref: wanted.has(c.id)
        ? "/wants"
        : `/wants/new?title=${encodeURIComponent(c.name)}&coin_type_id=${c.id}`,
    };
  });

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{setName}</h2>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${ownedCount} of ${total} owned · ${total - ownedCount} still needed`
              : "No coins in this set yet."}
          </p>
        </div>
        <Link
          href={`/collection/sets/${setId}`}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Manage set
        </Link>
      </div>

      {total > 0 && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
        </div>
      )}

      {total === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          This set has no coins yet.{" "}
          <Link href={`/collection/sets/${setId}`} className="underline">
            Add coins to it
          </Link>
          .
        </div>
      ) : (
        <SetChecklist tiles={tiles} ownedCount={ownedCount} total={total} />
      )}
    </div>
  );
}
