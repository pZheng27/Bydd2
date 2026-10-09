import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeLabel } from "@/lib/format";
import { CoinDetail } from "@/components/coin-detail";

// A single coin in someone's public collection, laid out exactly like the
// owner's own coin page (CoinDetail) but with only display-safe fields: title,
// grade, description and photos — never price, cert number or originals. Read
// with the service-role client, so it first proves the coin is in one of the
// collector's PUBLIC sets; anything else is a 404 (no guessing private coins).

const ITEM_COLS =
  "id, collection_id, coin_type_id, title, grade, designation, grading_service, notes, photos";

type Item = {
  id: string;
  collection_id: string;
  coin_type_id: string | null;
  title: string | null;
  grade: number | null;
  designation: string | null;
  grading_service: string | null;
  notes: string | null;
  photos: string[] | null;
};

export default async function PublicCoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<{ set?: string }>;
}) {
  const { id, itemId } = await params;
  const { set: wantSet } = await searchParams;
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
  if (!collection) notFound();

  const { data: itemRow } = await admin
    .from("collection_items")
    .select(ITEM_COLS)
    .eq("id", itemId)
    .eq("collection_id", collection.id)
    .maybeSingle();
  const item = itemRow as Item | null;
  if (!item) notFound();

  // Which of the collector's public sets is this coin shown in?
  const { data: setRows } = await admin
    .from("collection_sets")
    .select("id, name, source_set_id")
    .eq("collection_id", collection.id)
    .eq("is_public", true);
  const sets = (setRows ?? []) as {
    id: string;
    name: string;
    source_set_id: string | null;
  }[];
  const freeformIds = sets.filter((s) => !s.source_set_id).map((s) => s.id);
  const seriesIds = sets.filter((s) => s.source_set_id).map((s) => s.id);

  const inSets = new Set<string>();
  if (freeformIds.length) {
    const { data } = await admin
      .from("collection_set_coins")
      .select("collection_set_id")
      .in("collection_set_id", freeformIds)
      .eq("collection_item_id", item.id);
    for (const r of data ?? []) inSets.add(r.collection_set_id as string);
  }
  if (seriesIds.length && item.coin_type_id) {
    const { data } = await admin
      .from("collection_set_members")
      .select("collection_set_id")
      .in("collection_set_id", seriesIds)
      .eq("coin_type_id", item.coin_type_id);
    for (const r of data ?? []) inSets.add(r.collection_set_id as string);
  }
  if (!inSets.size) notFound();

  // Breadcrumb back to the set the visitor came from (if it's a valid one).
  const set =
    sets.find((s) => s.id === wantSet && inSets.has(s.id)) ??
    sets.find((s) => inSets.has(s.id))!;
  const owner = profile.display_name || "A collector";

  return (
    <CoinDetail
      crumbs={[
        { href: `/u/${id}`, label: owner },
        { href: `/u/${id}#set-${set.id}`, label: set.name },
      ]}
      title={item.title}
      grade={gradeLabel(item)}
      photos={item.photos ?? []}
      description={item.notes}
    />
  );
}
