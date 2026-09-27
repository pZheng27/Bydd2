import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { embeddedOne } from "@/lib/catalog";
import { publicPhotoUrl } from "@/lib/photos";
import { CoinTileImage } from "@/components/coin-tile";

// Browse other collectors' public collections. Read with the service-role
// client and only display-safe fields (display name, public set names, and the
// photos of coins in those public sets), so no private data is exposed. The
// signed-in viewer's own collection is left out.

const PREVIEW = 4; // coin thumbnails shown per collector card

type PubSet = {
  id: string;
  name: string;
  collection_id: string;
  source_set_id: string | null;
};
type Collector = {
  profileId: string;
  name: string;
  setCount: number;
  photos: string[];
};

export default async function CollectionsBrowsePage() {
  const admin = createAdminClient();

  // The viewer's own profile, so we can leave their collection out.
  let myProfileId: string | null = null;
  {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      myProfileId = prof?.id ?? null;
    }
  }

  let collectors: Collector[] = [];
  if (admin) {
    const { data: sets } = await admin
      .from("collection_sets")
      .select("id, name, collection_id, source_set_id")
      .eq("is_public", true);
    const pubSets = (sets as PubSet[] | null) ?? [];

    if (pubSets.length) {
      const setToCollection = new Map(
        pubSets.map((s) => [s.id, s.collection_id] as const),
      );

      // Public set names grouped by collection.
      const setsByCollection = new Map<string, string[]>();
      for (const s of pubSets) {
        const arr = setsByCollection.get(s.collection_id) ?? [];
        arr.push(s.name);
        setsByCollection.set(s.collection_id, arr);
      }

      // A few coin photos per collection, from the coins in their public sets.
      const photosByCollection = new Map<string, string[]>();
      const addPhoto = (collectionId: string, photo?: string | null) => {
        if (!photo) return;
        const arr = photosByCollection.get(collectionId) ?? [];
        if (arr.length < PREVIEW && !arr.includes(photo)) arr.push(photo);
        photosByCollection.set(collectionId, arr);
      };

      // Freeform sets → the coins dropped into them.
      const freeformIds = pubSets
        .filter((s) => !s.source_set_id)
        .map((s) => s.id);
      if (freeformIds.length) {
        const { data } = await admin
          .from("collection_set_coins")
          .select("collection_set_id, sort_order, collection_item:collection_items(photos)")
          .in("collection_set_id", freeformIds)
          .order("sort_order", { ascending: true });
        for (const row of (data ?? []) as {
          collection_set_id: string;
          collection_item: { photos: string[] | null } | { photos: string[] | null }[] | null;
        }[]) {
          const colId = setToCollection.get(row.collection_set_id);
          const item = embeddedOne<{ photos: string[] | null }>(row.collection_item);
          if (colId) addPhoto(colId, item?.photos?.[0]);
        }
      }

      // Series sets → the owned coins matching their catalog slots.
      const seriesIds = pubSets
        .filter((s) => s.source_set_id)
        .map((s) => s.id);
      if (seriesIds.length) {
        const { data: members } = await admin
          .from("collection_set_members")
          .select("collection_set_id, coin_type_id")
          .in("collection_set_id", seriesIds);
        const slotsByCollection = new Map<string, Set<string>>();
        const allSlotIds = new Set<string>();
        for (const m of (members ?? []) as {
          collection_set_id: string;
          coin_type_id: string | null;
        }[]) {
          const colId = setToCollection.get(m.collection_set_id);
          if (!colId || !m.coin_type_id) continue;
          const s = slotsByCollection.get(colId) ?? new Set<string>();
          s.add(m.coin_type_id);
          slotsByCollection.set(colId, s);
          allSlotIds.add(m.coin_type_id);
        }
        if (allSlotIds.size) {
          const { data: owned } = await admin
            .from("collection_items")
            .select("collection_id, coin_type_id, photos")
            .in("collection_id", [...slotsByCollection.keys()])
            .in("coin_type_id", [...allSlotIds]);
          for (const it of (owned ?? []) as {
            collection_id: string;
            coin_type_id: string | null;
            photos: string[] | null;
          }[]) {
            const slots = slotsByCollection.get(it.collection_id);
            if (slots && it.coin_type_id && slots.has(it.coin_type_id))
              addPhoto(it.collection_id, it.photos?.[0]);
          }
        }
      }

      // Resolve collections → profiles and assemble the cards.
      const collectionIds = [...setsByCollection.keys()];
      const { data: cols } = await admin
        .from("collections")
        .select("id, profile_id")
        .in("id", collectionIds);
      const { data: profs } = await admin
        .from("profiles")
        .select("id, display_name")
        .in(
          "id",
          (cols ?? []).map((c) => c.profile_id).filter(Boolean),
        );
      const nameOf = new Map<string, string>();
      for (const p of profs ?? [])
        nameOf.set(p.id, p.display_name || "A collector");

      collectors = (cols ?? [])
        .filter((c) => c.profile_id && c.profile_id !== myProfileId)
        .map((c) => ({
          profileId: c.profile_id as string,
          name: nameOf.get(c.profile_id as string) ?? "A collector",
          setCount: setsByCollection.get(c.id)?.length ?? 0,
          photos: photosByCollection.get(c.id) ?? [],
        }))
        .filter((c) => c.setCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Collections</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Browse other collectors&apos; public sets.
        </p>
      </div>

      {collectors.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No public collections to show yet.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collectors.map((c) => (
            <Link
              key={c.profileId}
              href={`/u/${c.profileId}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="grid grid-cols-4 gap-px bg-border/60">
                {Array.from({ length: PREVIEW }).map((_, i) =>
                  c.photos[i] ? (
                    <CoinTileImage
                      key={i}
                      src={publicPhotoUrl(c.photos[i])}
                      alt=""
                    />
                  ) : (
                    <div key={i} className="aspect-square bg-muted" />
                  ),
                )}
              </div>
              <div className="p-4">
                <div className="text-base font-semibold tracking-tight">
                  {c.name}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {c.setCount} public {c.setCount === 1 ? "set" : "sets"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
