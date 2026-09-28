import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { embeddedOne } from "@/lib/catalog";
import { publicPhotoUrl } from "@/lib/photos";
import { CoinTileImage } from "@/components/coin-tile";

// Browse other collectors' public sets — one card per public set, showing the
// set title, whose it is, an optional description, and a few coin photos from
// it. Read with the service-role client and only display-safe fields, so no
// private data is exposed. The viewer's own sets are left out.

const PREVIEW = 4; // coin thumbnails shown per set card

type PubSet = {
  id: string;
  name: string;
  collection_id: string;
  source_set_id: string | null;
};
type Card = {
  setId: string;
  profileId: string;
  title: string;
  username: string;
  description: string;
  photos: string[];
};

export default async function CollectionsBrowsePage() {
  const admin = createAdminClient();

  // The viewer's own profile, so we can leave their sets out.
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

  let cards: Card[] = [];
  if (admin) {
    const { data: sets } = await admin
      .from("collection_sets")
      .select("id, name, collection_id, source_set_id")
      .eq("is_public", true);
    const pubSets = (sets as PubSet[] | null) ?? [];

    if (pubSets.length) {
      // A few coin photos per set.
      const photosBySet = new Map<string, string[]>();
      const addPhoto = (setId: string, photo?: string | null) => {
        if (!photo) return;
        const arr = photosBySet.get(setId) ?? [];
        if (arr.length < PREVIEW && !arr.includes(photo)) arr.push(photo);
        photosBySet.set(setId, arr);
      };

      // Freeform sets → the coins dropped into them.
      const freeformIds = pubSets.filter((s) => !s.source_set_id).map((s) => s.id);
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
          const item = embeddedOne<{ photos: string[] | null }>(row.collection_item);
          addPhoto(row.collection_set_id, item?.photos?.[0]);
        }
      }

      // Series sets → the owned coins matching their catalog slots.
      const seriesSets = pubSets.filter((s) => s.source_set_id);
      if (seriesSets.length) {
        const { data: members } = await admin
          .from("collection_set_members")
          .select("collection_set_id, coin_type_id")
          .in(
            "collection_set_id",
            seriesSets.map((s) => s.id),
          );
        const slotsBySet = new Map<string, string[]>();
        const allSlotIds = new Set<string>();
        for (const m of (members ?? []) as {
          collection_set_id: string;
          coin_type_id: string | null;
        }[]) {
          if (!m.coin_type_id) continue;
          const a = slotsBySet.get(m.collection_set_id) ?? [];
          a.push(m.coin_type_id);
          slotsBySet.set(m.collection_set_id, a);
          allSlotIds.add(m.coin_type_id);
        }
        if (allSlotIds.size) {
          const { data: owned } = await admin
            .from("collection_items")
            .select("collection_id, coin_type_id, photos")
            .in("collection_id", [...new Set(seriesSets.map((s) => s.collection_id))])
            .in("coin_type_id", [...allSlotIds]);
          const ownedPhoto = new Map<string, string>();
          for (const it of (owned ?? []) as {
            collection_id: string;
            coin_type_id: string | null;
            photos: string[] | null;
          }[]) {
            if (it.coin_type_id && it.photos?.[0])
              ownedPhoto.set(`${it.collection_id}:${it.coin_type_id}`, it.photos[0]);
          }
          for (const s of seriesSets) {
            for (const ct of slotsBySet.get(s.id) ?? [])
              addPhoto(s.id, ownedPhoto.get(`${s.collection_id}:${ct}`));
          }
        }
      }

      // Optional descriptions (tolerant: the column may not exist yet).
      const descBySet = new Map<string, string>();
      {
        const { data: descs } = await admin
          .from("collection_sets")
          .select("id, description")
          .in(
            "id",
            pubSets.map((s) => s.id),
          );
        for (const d of (descs ?? []) as { id: string; description: string | null }[])
          if (d.description) descBySet.set(d.id, d.description);
      }

      // Resolve sets → collections → profiles.
      const { data: cols } = await admin
        .from("collections")
        .select("id, profile_id")
        .in("id", [...new Set(pubSets.map((s) => s.collection_id))]);
      const colToProfile = new Map<string, string>();
      for (const c of cols ?? []) if (c.profile_id) colToProfile.set(c.id, c.profile_id);
      const { data: profs } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", [...new Set([...colToProfile.values()])]);
      const nameOf = new Map<string, string>();
      for (const p of profs ?? []) nameOf.set(p.id, p.display_name || "A collector");

      cards = pubSets
        .map((s): Card | null => {
          const profileId = colToProfile.get(s.collection_id);
          if (!profileId) return null;
          return {
            setId: s.id,
            profileId,
            title: s.name,
            username: nameOf.get(profileId) ?? "A collector",
            description: descBySet.get(s.id) ?? "",
            photos: photosBySet.get(s.id) ?? [],
          };
        })
        .filter((c): c is Card => !!c && c.profileId !== myProfileId)
        .sort((a, b) => a.title.localeCompare(b.title));
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

      {cards.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No public sets to show yet.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.setId}
              href={`/u/${c.profileId}#set-${c.setId}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="grid grid-cols-4 gap-px bg-border/60">
                {Array.from({ length: PREVIEW }).map((_, i) =>
                  c.photos[i] ? (
                    <CoinTileImage key={i} src={publicPhotoUrl(c.photos[i])} alt="" />
                  ) : (
                    <div key={i} className="aspect-square bg-muted" />
                  ),
                )}
              </div>
              <div className="p-4">
                <div className="truncate text-base font-semibold tracking-tight">
                  {c.title}
                </div>
                {c.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                ) : null}
                <div className="mt-1 truncate text-[11px] text-muted-foreground/80">
                  {c.username}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
