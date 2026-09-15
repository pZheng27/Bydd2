"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
