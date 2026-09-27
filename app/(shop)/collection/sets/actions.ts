"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.trim();
  return s ? s : null;
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

/**
 * Create a custom set. Optionally seed its slots from a catalog template
 * (source_set_id) by copying that template's coins. Lands on the new set's grid.
 */
export async function createCollectionSet(formData: FormData) {
  const supabase = await createClient();
  const collectionId = await myCollectionId(supabase);
  if (!collectionId) return;

  const sourceSetId = str(formData.get("source_set_id"));
  const { data: created } = await supabase
    .from("collection_sets")
    .insert({
      collection_id: collectionId,
      name: str(formData.get("name")) ?? "My set",
      source_set_id: sourceSetId,
    })
    .select("id")
    .single();
  if (!created) return;

  // Description saved separately so set creation still works if the column
  // hasn't been added yet (the update is a no-op in that case).
  const description = str(formData.get("description"));
  if (description) {
    await supabase
      .from("collection_sets")
      .update({ description })
      .eq("id", created.id);
  }

  if (sourceSetId) {
    const { data: members } = await supabase
      .from("set_members")
      .select("coin_type_id, sort_order")
      .eq("set_id", sourceSetId);
    if (members?.length) {
      await supabase.from("collection_set_members").insert(
        members.map((m) => ({
          collection_set_id: created.id,
          coin_type_id: m.coin_type_id,
          sort_order: m.sort_order,
        })),
      );
    }
  }

  redirect(`/collection?set=${created.id}`);
}

/**
 * Toggle whether a set appears on the owner's public profile. RLS scopes the
 * update to the owner. No-op if the is_public column isn't there yet.
 */
export async function setSetVisibility(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const isPublic = String(formData.get("is_public") ?? "") === "true";
  const supabase = await createClient();
  await supabase
    .from("collection_sets")
    .update({ is_public: isPublic })
    .eq("id", id);
  redirect(`/collection/sets/${id}`);
}

/** Save a set's name and description (RLS scopes the update to the owner). */
export async function renameCollectionSet(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = str(formData.get("name"));
  if (!id || !name) return;
  const supabase = await createClient();
  await supabase.from("collection_sets").update({ name }).eq("id", id);
  // Separate update so the name still saves if the description column isn't
  // there yet (that update is then a no-op).
  if (formData.has("description")) {
    await supabase
      .from("collection_sets")
      .update({ description: str(formData.get("description")) })
      .eq("id", id);
  }
  redirect(`/collection/sets/${id}`);
}

/**
 * Delete a set. For a freeform set this also permanently deletes the coins it
 * holds from the collection (the coins are what that set is). A series set is a
 * catalog checklist, so its owned coins stay in the collection — only the
 * checklist is removed. RLS scopes every delete to the owner.
 */
export async function deleteCollectionSet(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("collection_sets")
    .select("id, source_set_id")
    .eq("id", id)
    .maybeSingle();

  // Freeform set → delete its coins from the collection too.
  if (set && !set.source_set_id) {
    const { data: links } = await supabase
      .from("collection_set_coins")
      .select("collection_item_id")
      .eq("collection_set_id", id);
    const itemIds = (links ?? [])
      .map((l) => l.collection_item_id as string | null)
      .filter((v): v is string => !!v);
    if (itemIds.length) {
      await supabase.from("collection_items").delete().in("id", itemIds);
    }
  }

  await supabase.from("collection_sets").delete().eq("id", id);
  redirect("/collection");
}

/** Add one or more catalog coins as slots in a set (skips ones already in it). */
export async function addCoinsToSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "");
  if (!setId) return;
  const coinTypeIds = formData
    .getAll("coin_type_id")
    .map(String)
    .filter(Boolean);
  if (!coinTypeIds.length) return redirect(`/collection/sets/${setId}`);

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("collection_set_members")
    .select("coin_type_id")
    .eq("collection_set_id", setId);
  const have = new Set((existing ?? []).map((m) => m.coin_type_id));
  const toAdd = coinTypeIds.filter((id) => !have.has(id));
  if (!toAdd.length) return redirect(`/collection/sets/${setId}`);

  // Order new slots by the coin's year so the grid reads chronologically.
  const { data: coins } = await supabase
    .from("coin_types")
    .select("id, year")
    .in("id", toAdd);
  const yearOf = new Map((coins ?? []).map((c) => [c.id, c.year as number | null]));

  await supabase.from("collection_set_members").insert(
    toAdd.map((coin_type_id) => ({
      collection_set_id: setId,
      coin_type_id,
      sort_order: yearOf.get(coin_type_id) ?? null,
    })),
  );

  redirect(`/collection/sets/${setId}`);
}

/** Remove a slot from a set. */
export async function removeCoinFromSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "");
  const coinTypeId = String(formData.get("coin_type_id") ?? "");
  if (!setId || !coinTypeId) return;
  const supabase = await createClient();
  await supabase
    .from("collection_set_members")
    .delete()
    .eq("collection_set_id", setId)
    .eq("coin_type_id", coinTypeId);
  redirect(`/collection/sets/${setId}`);
}

/**
 * Add specific coins the collector owns into a freeform set (skips ones already
 * in it and anything not actually in their collection).
 */
export async function addOwnCoinsToSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "");
  if (!setId) return;
  const itemIds = formData
    .getAll("collection_item_id")
    .map(String)
    .filter(Boolean);
  if (!itemIds.length) return redirect(`/collection/sets/${setId}`);

  const supabase = await createClient();
  const collectionId = await myCollectionId(supabase);
  if (!collectionId) return;

  // Only add coins that are actually in this collector's collection.
  const { data: mine } = await supabase
    .from("collection_items")
    .select("id")
    .eq("collection_id", collectionId)
    .in("id", itemIds);
  const ownIds = new Set((mine ?? []).map((r) => r.id));

  const { data: existing } = await supabase
    .from("collection_set_coins")
    .select("collection_item_id")
    .eq("collection_set_id", setId);
  const have = new Set((existing ?? []).map((m) => m.collection_item_id));

  const toAdd = itemIds.filter((id) => ownIds.has(id) && !have.has(id));
  if (!toAdd.length) return redirect(`/collection/sets/${setId}`);

  const base = existing?.length ?? 0;
  await supabase.from("collection_set_coins").insert(
    toAdd.map((collection_item_id, i) => ({
      collection_set_id: setId,
      collection_item_id,
      sort_order: base + i,
    })),
  );

  redirect(`/collection/sets/${setId}`);
}

/** Remove a coin from a freeform set (the coin stays in the collection). */
export async function removeOwnCoinFromSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "");
  const itemId = String(formData.get("collection_item_id") ?? "");
  if (!setId || !itemId) return;
  const supabase = await createClient();
  await supabase
    .from("collection_set_coins")
    .delete()
    .eq("collection_set_id", setId)
    .eq("collection_item_id", itemId);
  redirect(`/collection/sets/${setId}`);
}
