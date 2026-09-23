"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enhanceItemPhotos, removeStoredPhotos } from "@/lib/enhance";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.trim();
  return s ? s : null;
}
function toNum(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
function toCents(v: FormDataEntryValue | null): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n * 100);
}

/** The signed-in user's collection id (auto-created in S2; create if missing). */
async function myCollectionId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prof) return null;
  const { data: col } = await supabase
    .from("collections")
    .select("id")
    .eq("profile_id", prof.id)
    .maybeSingle();
  if (col) return col.id;
  const created = await supabase
    .from("collections")
    .insert({ profile_id: prof.id })
    .select("id")
    .single();
  return created.data?.id ?? null;
}

/** The catalog coin's descriptive fields, copied onto an item when it's linked. */
async function catalogFields(supabase: SupabaseClient, coinTypeId: string) {
  const { data: ct } = await supabase
    .from("coin_types")
    .select("series, year, mintmark, variety, metal, fine_weight_oz")
    .eq("id", coinTypeId)
    .maybeSingle();
  return ct
    ? {
        series: ct.series,
        year: ct.year,
        mintmark: ct.mintmark,
        variety: ct.variety,
        metal: ct.metal,
        fine_weight_oz: ct.fine_weight_oz,
      }
    : {};
}

/** Add a coin the collector owns (hand-entered, optionally linked to the catalog). */
export async function addCollectionItem(formData: FormData) {
  const supabase = await createClient();
  const collectionId = await myCollectionId(supabase);
  if (!collectionId) return;

  const grade = toNum(formData.get("grade"));
  const gradeVal =
    grade != null && grade >= 1 && grade <= 70 ? Math.round(grade) : null;
  const photos = formData.getAll("photos").map(String).filter(Boolean);
  const coinTypeId = str(formData.get("coin_type_id"));
  const setId = str(formData.get("collection_set_id"));
  // A coin must be added to a set (enforced in the form too).
  if (!setId) redirect("/collection/new");

  const { data: created } = await supabase
    .from("collection_items")
    .insert({
      collection_id: collectionId,
      coin_type_id: coinTypeId,
      ...(coinTypeId ? await catalogFields(supabase, coinTypeId) : {}),
      title: str(formData.get("title")) ?? "Untitled coin",
      grading_service: str(formData.get("grading_service")),
      cert_number: str(formData.get("cert_number")),
      grade: gradeVal,
      notes: str(formData.get("notes")),
      acquired_price_cents: toCents(formData.get("acquired_price")),
      photos,
    })
    .select("id")
    .single();

  // A freeform set holds specific coins, so link the new coin into it. A series
  // (checklist) set instead checks off automatically via coin_type_id above, so
  // it needs no membership row.
  if (created && setId) {
    const { data: set } = await supabase
      .from("collection_sets")
      .select("source_set_id")
      .eq("id", setId)
      .maybeSingle();
    if (set && !set.source_set_id) {
      await supabase
        .from("collection_set_coins")
        .insert({ collection_set_id: setId, collection_item_id: created.id });
    }
  }

  // Prettify the uploaded photos in the background — never blocks the upload.
  if (created && photos.length) {
    const newId = created.id;
    after(() => enhanceItemPhotos("collection_items", newId, photos));
  }

  redirect(setId ? `/collection?set=${setId}` : "/collection");
}

/**
 * Link (or unlink) a collection item to a catalog coin. Linking copies the
 * catalog's series/year/mintmark/etc. onto the item and is what makes the coin
 * count toward set completion. An empty coin_type_id clears the link.
 */
export async function linkCollectionItemToCatalog(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const coinTypeId = str(formData.get("coin_type_id"));

  if (!coinTypeId) {
    await supabase
      .from("collection_items")
      .update({ coin_type_id: null })
      .eq("id", id);
    redirect(`/collection/${id}`);
    return;
  }

  await supabase
    .from("collection_items")
    .update({ coin_type_id: coinTypeId, ...(await catalogFields(supabase, coinTypeId)) })
    .eq("id", id);
  redirect(`/collection/${id}`);
}

/** Remove a coin from the collection and its photos (originals + enhanced). */
export async function deleteCollectionItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  // Delete the row first — RLS ensures only the owner can — then clean up its
  // stored photos only for a row that was actually removed.
  const { data: deleted } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", id)
    .select("*");
  const row = deleted?.[0];
  if (row) {
    await removeStoredPhotos([
      ...(row.photos ?? []),
      ...(row.photos_original ?? []),
    ]);
  }
  redirect("/collection");
}

/**
 * Copy a collection item into the dealer's inventory as an unlisted draft
 * (auto-creating the dealer if needed), carrying the acquisition price over as
 * the private cost basis. Drops the user on the item page to price and list it.
 */
export async function sellThisCoin(formData: FormData) {
  const collItemId = String(formData.get("id") ?? "");
  if (!collItemId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prof) return;

  const { data: ci } = await supabase
    .from("collection_items")
    .select(
      "title, series, year, mintmark, variety, metal, fine_weight_oz, grade, designation, grading_service, cert_number, notes, photos, coin_type_id, acquired_price_cents",
    )
    .eq("id", collItemId)
    .single();
  if (!ci) return;

  let { data: dealer } = await supabase
    .from("dealers")
    .select("id")
    .eq("profile_id", prof.id)
    .maybeSingle();
  if (!dealer) {
    const created = await supabase
      .from("dealers")
      .insert({ profile_id: prof.id })
      .select("id")
      .single();
    dealer = created.data;
  }
  if (!dealer) return;

  const { data: inv } = await supabase
    .from("inventory_items")
    .insert({
      dealer_id: dealer.id,
      coin_type_id: ci.coin_type_id,
      title: ci.title,
      series: ci.series,
      year: ci.year,
      mintmark: ci.mintmark,
      variety: ci.variety,
      metal: ci.metal,
      fine_weight_oz: ci.fine_weight_oz,
      grade: ci.grade,
      designation: ci.designation,
      grading_service: ci.grading_service,
      cert_number: ci.cert_number,
      description: ci.notes,
      photos: ci.photos ?? [],
      price_cents: 0,
      status: "unlisted",
      is_public: false,
    })
    .select("id")
    .single();
  if (!inv) return;

  if (ci.acquired_price_cents != null) {
    await supabase
      .from("inventory_costs")
      .insert({ inventory_item_id: inv.id, cost_cents: ci.acquired_price_cents });
  }

  // Link the collection item to its listing so we can show "Listed on marketplace".
  await supabase
    .from("collection_items")
    .update({ inventory_item_id: inv.id })
    .eq("id", collItemId);

  redirect(`/dealer/inventory/${inv.id}`);
}
