import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicPhotoUrl } from "@/lib/photos";
import { gradeLabel } from "@/lib/format";
import { embeddedOne } from "@/lib/catalog";
import { PublicCoinGrid } from "@/components/public-coin-grid";

// A collector's public profile: the sets they've marked public, each shown as a
// gallery of the coins they own in it. Read with the service-role client and
// only display-safe fields (no email, prices, notes or cert numbers), filtered
// to is_public sets — so nothing private is ever exposed.

type PubItem = {
  id: string;
  title: string | null;
  grade: number | null;
  designation: string | null;
  grading_service: string | null;
  notes: string | null;
  photos: string[] | null;
};

const ITEM_COLS =
  "id, title, grade, designation, grading_service, notes, photos";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const { data: collection } = await admin
    .from("collections")
    .select("id")
    .eq("profile_id", id)
    .maybeSingle();

  let sets: { id: string; name: string; source_set_id: string | null }[] = [];
  if (collection) {
    const { data } = await admin
      .from("collection_sets")
      .select("id, name, source_set_id")
      .eq("collection_id", collection.id)
      .eq("is_public", true)
      .order("created_at", { ascending: true });
    sets = (data as typeof sets) ?? [];
  }

  // Optional set descriptions (tolerant: the column may not exist yet).
  const descBySet = new Map<string, string>();
  if (sets.length) {
    const { data: descs } = await admin
      .from("collection_sets")
      .select("id, description")
      .in(
        "id",
        sets.map((s) => s.id),
      );
    for (const d of (descs ?? []) as { id: string; description: string | null }[])
      if (d.description) descBySet.set(d.id, d.description);
  }

  const sections: {
    name: string;
    id: string;
    description: string;
    coins: PubItem[];
  }[] = [];
  for (const s of sets) {
    let coins: PubItem[] = [];
    if (s.source_set_id) {
      // Series set: the owned coins matching its catalog slots.
      const { data: members } = await admin
        .from("collection_set_members")
        .select("coin_type_id")
        .eq("collection_set_id", s.id);
      const slotIds = (members ?? [])
        .map((m) => m.coin_type_id as string | null)
        .filter((v): v is string => !!v);
      if (slotIds.length && collection) {
        const { data: owned } = await admin
          .from("collection_items")
          .select(ITEM_COLS)
          .eq("collection_id", collection.id)
          .in("coin_type_id", slotIds);
        coins = (owned as PubItem[]) ?? [];
      }
    } else {
      // Freeform set: the coins the collector dropped into it.
      const { data: rows } = await admin
        .from("collection_set_coins")
        .select(`sort_order, collection_item:collection_items(${ITEM_COLS})`)
        .eq("collection_set_id", s.id);
      coins = (((rows ?? []) as unknown) as {
        sort_order: number | null;
        collection_item: PubItem | PubItem[] | null;
      }[])
        .map((r) => ({ so: r.sort_order, it: embeddedOne<PubItem>(r.collection_item) }))
        .filter((r): r is { so: number | null; it: PubItem } => !!r.it)
        .sort((a, b) => (a.so ?? 1e9) - (b.so ?? 1e9))
        .map((r) => r.it);
    }
    if (coins.length)
      sections.push({
        id: s.id,
        name: s.name,
        description: descBySet.get(s.id) ?? "",
        coins,
      });
  }

  return (
    <div className="mx-auto max-w-5xl">
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No public sets to show yet.
        </p>
      ) : (
        <div className="space-y-12">
          {sections.map((sec) => (
            <section key={sec.id} id={`set-${sec.id}`} className="scroll-mt-20">
              <h2 className="text-3xl font-semibold tracking-tight">{sec.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {sec.coins.length} {sec.coins.length === 1 ? "coin" : "coins"}
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground/80">
                {profile.display_name || "A collector"}
              </p>
              {sec.description && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {sec.description}
                </p>
              )}
              <PublicCoinGrid
                profileId={profile.id}
                setId={sec.id}
                coins={sec.coins.map((c) => ({
                  id: c.id,
                  title: c.title ?? "",
                  grade: gradeLabel(c),
                  description: c.notes ?? "",
                  photos: (c.photos ?? []).map(publicPhotoUrl),
                }))}
              />
            </section>
          ))}
        </div>
      )}

      <footer className="mt-16 border-t pt-6 text-xs text-muted-foreground">
        Shared from Bydd
      </footer>
    </div>
  );
}
