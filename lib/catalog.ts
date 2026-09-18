import type { SupabaseClient } from "@supabase/supabase-js";

/** A canonical coin in the shared catalog (public.coin_types). */
export type CoinType = {
  id: string;
  slug: string;
  series: string;
  year: number | null;
  mintmark: string | null;
  variety: string | null;
  metal: string | null;
  fine_weight_oz: number | null;
  name: string;
};

/** A curated catalog set template (public.sets) with its coin count. */
export type CatalogSet = {
  id: string;
  slug: string;
  name: string;
  series: string | null;
  description: string | null;
  member_count: number;
};

type CatalogSetRow = {
  id: string;
  slug: string;
  name: string;
  series: string | null;
  description: string | null;
  set_members: { count: number }[] | null;
};

const COIN_TYPE_COLS =
  "id, slug, series, year, mintmark, variety, metal, fine_weight_oz, name";

/** All catalog coins, ordered by series then year. Empty until the catalog is seeded. */
export async function getCoinTypes(
  supabase: SupabaseClient,
): Promise<CoinType[]> {
  const { data } = await supabase
    .from("coin_types")
    .select(COIN_TYPE_COLS)
    .order("series", { ascending: true })
    .order("year", { ascending: true });
  return (data as CoinType[]) ?? [];
}

/** Fetch specific catalog coins by id, preserving series/year ordering. */
export async function getCoinTypesByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<CoinType[]> {
  if (!ids.length) return [];
  const { data } = await supabase
    .from("coin_types")
    .select(COIN_TYPE_COLS)
    .in("id", ids);
  return (data as CoinType[]) ?? [];
}

/**
 * A PostgREST to-one embed (e.g. `coin_type:coin_types(...)`) returns a single
 * object at runtime but is often typed as an array. Normalize to one row.
 */
export function embeddedOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Group coins by series, e.g. for <optgroup> pickers. Preserves input order. */
export function groupBySeries(coins: CoinType[]): [string, CoinType[]][] {
  const map = new Map<string, CoinType[]>();
  for (const c of coins) {
    const arr = map.get(c.series) ?? [];
    arr.push(c);
    map.set(c.series, arr);
  }
  return [...map.entries()];
}

/** Catalog set templates (curated), each with how many coins it contains. */
export async function getCatalogSets(
  supabase: SupabaseClient,
): Promise<CatalogSet[]> {
  const { data } = await supabase
    .from("sets")
    .select("id, slug, name, series, description, set_members(count)")
    .order("name", { ascending: true });
  return ((data as CatalogSetRow[]) ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    series: s.series,
    description: s.description,
    member_count: s.set_members?.[0]?.count ?? 0,
  }));
}
