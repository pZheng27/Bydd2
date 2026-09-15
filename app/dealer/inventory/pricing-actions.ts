"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { evaluateRule, type EvaluateResult, type Metal } from "@/lib/domain/pricing";
import { itemSignals } from "@/lib/pricing-context";
import { fmtMoney } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

const TEST_GOLD_COOKIE = "test_gold_cents";

type RuleParams = {
  metal?: string;
  fine_weight_oz?: number | null;
  pct_over_spot?: number | null;
  floor_cents?: number | null;
  max_daily_move_pct?: number | null;
  // Optional demand signals (Session 3 Part C).
  demand_bump_pct?: number | null;
  views_threshold?: number | null;
  watches_threshold?: number | null;
  use_comp?: boolean;
};

function num(v: FormDataEntryValue | null): number | null {
  const s = (v as string | null)?.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/** Effective gold spot: a per-browser test override (cookie) wins over the DB. */
async function effectiveGoldCents(
  supabase: SupabaseClient,
): Promise<number | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TEST_GOLD_COOKIE)?.value;
  const o = raw ? Number(raw) : NaN;
  if (!Number.isNaN(o) && o > 0) return Math.round(o);
  const { data } = await supabase
    .from("spot_prices")
    .select("price_cents_per_oz")
    .eq("metal", "gold")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.price_cents_per_oz ?? null;
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

  // Optional demand signals. Blank fields stay off (null / false).
  const demandBumpPct = num(formData.get("demand_bump_pct"));
  const viewsThreshold = num(formData.get("views_threshold"));
  const watchesThreshold = num(formData.get("watches_threshold"));
  const useComp = formData.get("use_comp") === "on";

  await supabase.from("pricing_rules").delete().eq("inventory_item_id", itemId);
  await supabase.from("pricing_rules").insert({
    inventory_item_id: itemId,
    kind: "spot_plus_pct",
    params: {
      metal,
      fine_weight_oz: fineWeightOz,
      pct_over_spot: pctOverSpot,
      floor_cents: floorCents,
      demand_bump_pct: demandBumpPct,
      views_threshold: viewsThreshold,
      watches_threshold: watchesThreshold,
      use_comp: useComp,
    },
    is_active: true,
  });

  redirect(`/dealer/inventory/${itemId}`);
}

/** Show or hide the buyer-facing "How this price moves" note for an item. */
export async function setRuleVisible(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const visible = formData.get("visible") === "true";
  if (!itemId) return;
  const supabase = await createClient();
  await supabase
    .from("inventory_items")
    .update({ rule_visible: visible })
    .eq("id", itemId);
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

/** Test-only (local dev): force the gold price via a per-browser cookie. */
export async function setTestGold(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const dollars = num(formData.get("gold_price"));
  const cookieStore = await cookies();
  if (dollars != null && dollars > 0) {
    cookieStore.set(TEST_GOLD_COOKIE, String(Math.round(dollars * 100)), {
      path: "/",
    });
  }
  redirect(itemId ? `/dealer/inventory/${itemId}` : "/dealer/inventory");
}

/** Clear the test gold override (revert to the real spot price). */
export async function clearTestGold(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const cookieStore = await cookies();
  cookieStore.delete(TEST_GOLD_COOKIE);
  redirect(itemId ? `/dealer/inventory/${itemId}` : "/dealer/inventory");
}

function repriceSummary(
  oldCents: number,
  result: EvaluateResult,
  params: RuleParams,
  spotCents: number | null,
): string {
  const held = [
    result.applied.floor && "floor",
    result.applied.cost && "cost",
    result.applied.comp && "comp",
    result.applied.dailyMove && "max move",
  ].filter(Boolean);
  const spotStr = spotCents != null ? `${fmtMoney(spotCents)}/oz` : "spot";
  let s = `Repriced ${fmtMoney(oldCents)} → ${fmtMoney(result.priceCents)}: gold ${spotStr} × ${params.fine_weight_oz} oz + ${params.pct_over_spot ?? 0}%`;
  if (result.applied.demand) s += ` + demand ${params.demand_bump_pct}%`;
  if (held.length) s += ` (held by ${held.join(", ")})`;
  return s;
}

/** Recompute the item's price from its rule and apply it, logging the change. */
export async function repriceItem(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("price_cents, title, view_count, dealer_id")
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

  const spotCents = await effectiveGoldCents(supabase);

  // Live demand signals — watches (RLS-safe count) and the seller's own comps.
  const { data: dealer } = await supabase
    .from("dealers")
    .select("profile_id")
    .eq("id", item.dealer_id)
    .maybeSingle();
  const { watches, compCents } = await itemSignals(supabase, {
    itemId,
    itemTitle: item.title,
    sellerProfileId: dealer?.profile_id ?? null,
  });

  // Cost is private — read it from the owner-only companion table.
  const { data: costRow } = await supabase
    .from("inventory_costs")
    .select("cost_cents")
    .eq("inventory_item_id", itemId)
    .maybeSingle();
  const costCents = costRow?.cost_cents ?? null;

  const result = evaluateRule({
    currentPriceCents: item.price_cents,
    rule: {
      kind: "spot_plus_pct",
      metal: (params.metal ?? "gold") as Metal,
      fineWeightOz: params.fine_weight_oz,
      pctOverSpot: params.pct_over_spot ?? 0,
    },
    context: {
      spotPerOzCents: spotCents,
      views: item.view_count ?? 0,
      watches,
      compCents,
    },
    guardrails: {
      floorCents: params.floor_cents ?? null,
      costCents: costCents,
      maxDailyMovePct: params.max_daily_move_pct ?? null,
    },
    signals: {
      demandBumpPct: params.demand_bump_pct ?? null,
      viewsThreshold: params.views_threshold ?? null,
      watchesThreshold: params.watches_threshold ?? null,
      useComp: params.use_comp ?? false,
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
        views: item.view_count ?? 0,
        watches,
        comp_cents: compCents,
        applied: result.applied,
      },
    });
  }
  redirect(`/dealer/inventory/${itemId}`);
}
