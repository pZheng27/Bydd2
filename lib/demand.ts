import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Once a day, for each listed item linked to the catalog that has demand, write
 * a `demand_update` note to its activity feed (and a `recommendation` when open
 * wants exceed listed supply). Deduped per item per day. Service-role (cron).
 */
export async function writeDailyDemandNotes(
  admin: SupabaseClient,
): Promise<{ notes: number }> {
  const { data: items } = await admin
    .from("inventory_items")
    .select("id, coin_type_id")
    .eq("status", "listed")
    .eq("is_public", true)
    .not("coin_type_id", "is", null);
  if (!items?.length) return { notes: 0 };

  const coinTypeIds = [...new Set(items.map((i) => i.coin_type_id))];

  const { data: wants } = await admin
    .from("wants")
    .select("coin_type_id")
    .eq("status", "open")
    .in("coin_type_id", coinTypeIds);
  const wantCount = new Map<string, number>();
  for (const w of wants ?? [])
    wantCount.set(w.coin_type_id, (wantCount.get(w.coin_type_id) ?? 0) + 1);

  const listedCount = new Map<string, number>();
  for (const i of items)
    listedCount.set(i.coin_type_id, (listedCount.get(i.coin_type_id) ?? 0) + 1);

  // Don't repeat a note already written today.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const { data: todays } = await admin
    .from("agent_events")
    .select("inventory_item_id")
    .eq("kind", "demand_update")
    .gte("created_at", startOfToday.toISOString())
    .in(
      "inventory_item_id",
      items.map((i) => i.id),
    );
  const already = new Set((todays ?? []).map((e) => e.inventory_item_id));

  const events: { inventory_item_id: string; kind: string; summary: string }[] = [];
  for (const it of items) {
    if (already.has(it.id)) continue;
    const w = wantCount.get(it.coin_type_id) ?? 0;
    if (w === 0) continue; // only note when there's actual demand
    const m = listedCount.get(it.coin_type_id) ?? 0;
    events.push({
      inventory_item_id: it.id,
      kind: "demand_update",
      summary: `${w} open want${w === 1 ? "" : "s"} for this coin; ${m} listed marketplace-wide.`,
    });
    if (w > m) {
      events.push({
        inventory_item_id: it.id,
        kind: "recommendation",
        summary: `Demand exceeds supply (${w} wanted, ${m} listed) — consider raising your price.`,
      });
    }
  }
  if (events.length) await admin.from("agent_events").insert(events);
  return { notes: events.length };
}
