"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { evaluateRule, type EvaluateResult, type Metal } from "@/lib/domain/pricing";
import { fmtMoney } from "@/lib/format";

type RuleParams = {
  metal?: string;
  fine_weight_oz?: number | null;
  pct_over_spot?: number | null;
  floor_cents?: number | null;
  max_daily_move_pct?: number | null;
};

function repriceSummary(
  oldCents: number,
  result: EvaluateResult,
  params: RuleParams,
  spotCents: number | null,
): string {
  const bounds = [
    result.applied.floor && "floor",
    result.applied.cost && "cost",
    result.applied.dailyMove && "max move",
  ].filter(Boolean);
  const spotStr = spotCents != null ? `${fmtMoney(spotCents)}/oz` : "spot";
  let s = `Repriced ${fmtMoney(oldCents)} → ${fmtMoney(result.priceCents)}: gold ${spotStr} × ${params.fine_weight_oz} oz + ${params.pct_over_spot ?? 0}%`;
  if (bounds.length) s += ` (held by ${bounds.join(", ")})`;
  return s;
}

function num(v: FormDataEntryValue | null): number | null {
  const s = (v as string | null)?.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/** Create/replace the item's spot pricing rule (one active rule per item for now). */
export async function savePricingRule(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return;
  const supabase = await createClient();

  const metal = String(formData.get("metal") ?? "gold");
  const fineWeightOz = num(formData.get("fine_weight_oz"));
  const pctOverSpot = num(formData.get("pct_over_spot")) ?? 0;
  const floorDollars = num(formData.get("floor"));
  const floorCents = floorDollars == null ? null : Math.round(floorDollars * 100);

  await supabase.from("pricing_rules").delete().eq("inventory_item_id", itemId);
  await supabase.from("pricing_rules").insert({
    inventory_item_id: itemId,
    kind: "spot_plus_pct",
    params: {
      metal,
      fine_weight_oz: fineWeightOz,
      pct_over_spot: pctOverSpot,
      floor_cents: floorCents,
    },
    is_active: true,
  });

  redirect(`/dealer/inventory/${itemId}`);
}

/** Remove the item's pricing rule. */
export async function removePricingRule(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return;
  const supabase = await createClient();
  await supabase.from("pricing_rules").delete().eq("inventory_item_id", itemId);
  redirect(`/dealer/inventory/${itemId}`);
}

/** Advance the seeded gold price by a ±1% tick (demo of a spot move). */
export async function tickSpot(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("seed_spot");
  redirect(itemId ? `/dealer/inventory/${itemId}` : "/dealer/inventory");
}

/** Recompute the item's price from its rule and apply it, logging the change. */
export async function repriceItem(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("price_cents, cost_cents")
    .eq("id", itemId)
    .single();
  if (!item) redirect(`/dealer/inventory/${itemId}`);

  const { data: rule } = await supabase
    .from("pricing_rules")
    .select("params")
    .eq("inventory_item_id", itemId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const params = rule?.params as RuleParams | undefined;
  if (!params || params.fine_weight_oz == null) {
    redirect(`/dealer/inventory/${itemId}`);
  }

  const { data: spot } = await supabase
    .from("spot_prices")
    .select("price_cents_per_oz")
    .eq("metal", params.metal ?? "gold")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const spotCents = spot?.price_cents_per_oz ?? null;

  const result = evaluateRule({
    currentPriceCents: item.price_cents,
    rule: {
      kind: "spot_plus_pct",
      metal: (params.metal ?? "gold") as Metal,
      fineWeightOz: params.fine_weight_oz,
      pctOverSpot: params.pct_over_spot ?? 0,
    },
    context: { spotPerOzCents: spotCents },
    guardrails: {
      floorCents: params.floor_cents ?? null,
      costCents: item.cost_cents ?? null,
      maxDailyMovePct: params.max_daily_move_pct ?? null,
    },
  });

  if (result.changed) {
    await supabase.rpc("record_reprice", {
      p_item_id: itemId,
      p_new_price_cents: result.priceCents,
      p_summary: repriceSummary(item.price_cents, result, params, spotCents),
      p_payload: {
        old_price_cents: item.price_cents,
        new_price_cents: result.priceCents,
        spot_cents_per_oz: spotCents,
        applied: result.applied,
      },
    });
  }
  redirect(`/dealer/inventory/${itemId}`);
}
