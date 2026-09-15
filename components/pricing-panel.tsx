import { evaluateRule, type Metal } from "@/lib/domain/pricing";
import { fmtMoney } from "@/lib/format";
import { METALS } from "@/lib/coins";
import {
  savePricingRule,
  removePricingRule,
  repriceItem,
  setRuleVisible,
  setTestGold,
  clearTestGold,
} from "@/app/dealer/inventory/pricing-actions";
import { Button } from "@/components/ui/button";

const inputCls =
  "mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

type PanelItem = {
  id: string;
  price_cents: number;
  cost_cents: number | null;
};
type RuleParams = {
  metal?: string;
  fine_weight_oz?: number | null;
  pct_over_spot?: number | null;
  floor_cents?: number | null;
  max_daily_move_pct?: number | null;
  demand_bump_pct?: number | null;
  views_threshold?: number | null;
  watches_threshold?: number | null;
  use_comp?: boolean;
};

export function PricingPanel({
  item,
  rule,
  spotCents,
  views = 0,
  watches = 0,
  compCents = null,
  ruleVisible = false,
  testGoldActive = false,
  showTestControls = false,
}: {
  item: PanelItem;
  rule: { params: RuleParams } | null;
  spotCents: number | null;
  views?: number;
  watches?: number;
  compCents?: number | null;
  ruleVisible?: boolean;
  testGoldActive?: boolean;
  showTestControls?: boolean;
}) {
  const p: RuleParams = rule?.params ?? {};
  const hasRule = !!rule;

  const preview =
    hasRule && p.fine_weight_oz != null && spotCents != null
      ? evaluateRule({
          currentPriceCents: item.price_cents,
          rule: {
            kind: "spot_plus_pct",
            metal: (p.metal ?? "gold") as Metal,
            fineWeightOz: p.fine_weight_oz,
            pctOverSpot: p.pct_over_spot ?? 0,
          },
          context: {
            spotPerOzCents: spotCents,
            views,
            watches,
            compCents,
          },
          guardrails: {
            floorCents: p.floor_cents ?? null,
            costCents: item.cost_cents ?? null,
            maxDailyMovePct: p.max_daily_move_pct ?? null,
          },
          signals: {
            demandBumpPct: p.demand_bump_pct ?? null,
            viewsThreshold: p.views_threshold ?? null,
            watchesThreshold: p.watches_threshold ?? null,
            useComp: p.use_comp ?? false,
          },
        })
      : null;

  const bounds = preview
    ? [
        preview.applied.floor && "floor",
        preview.applied.cost && "cost",
        preview.applied.comp && "comp",
        preview.applied.dailyMove && "max move",
      ].filter(Boolean)
    : [];

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Pricing rule</div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Gold: {spotCents != null ? `${fmtMoney(spotCents)}/oz` : "—"}
            {testGoldActive && (
              <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                test
              </span>
            )}
          </span>
          {showTestControls && (
            <>
              <form action={setTestGold} className="flex items-center gap-1">
                <input type="hidden" name="item_id" value={item.id} />
                <span>Test $</span>
                <input
                  name="gold_price"
                  type="number"
                  step="0.01"
                  defaultValue={
                    spotCents != null ? (spotCents / 100).toFixed(2) : ""
                  }
                  className="w-24 rounded-md border bg-background px-2 py-1"
                />
                <button className="rounded-md border px-2 py-1 hover:bg-muted">
                  Set
                </button>
              </form>
              {testGoldActive && (
                <form action={clearTestGold}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <button className="rounded-md border px-2 py-1 hover:bg-muted">
                    Clear
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {preview && (
        <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
          Suggested price:{" "}
          <span className="font-semibold">{fmtMoney(preview.priceCents)}</span>{" "}
          <span className="text-muted-foreground">
            (current {fmtMoney(item.price_cents)})
          </span>
          {preview.applied.demand && (
            <div className="mt-1 text-xs text-muted-foreground">
              + {p.demand_bump_pct}% demand bump (high interest)
            </div>
          )}
          {bounds.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              bounded by {bounds.join(", ")}
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            signals: {views} view{views === 1 ? "" : "s"} · {watches} watching
            {compCents != null ? ` · comp ${fmtMoney(compCents)}` : ""}
          </div>
          {preview.changed ? (
            <form action={repriceItem} className="mt-2">
              <input type="hidden" name="item_id" value={item.id} />
              <Button type="submit" size="sm">
                Reprice now
              </Button>
            </form>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">
              Already at the suggested price.
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-sm">
          <div className="font-medium">Show buyers how this price moves</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {ruleVisible
              ? "Buyers see a plain-English note that this price tracks the metal market. Your %, floor, and cost stay hidden."
              : "Hidden — buyers just see the price."}
          </div>
        </div>
        <form action={setRuleVisible}>
          <input type="hidden" name="item_id" value={item.id} />
          <input
            type="hidden"
            name="visible"
            value={ruleVisible ? "false" : "true"}
          />
          <Button
            type="submit"
            size="sm"
            variant={ruleVisible ? "outline" : "default"}
          >
            {ruleVisible ? "Hide" : "Show buyers"}
          </Button>
        </form>
      </div>

      <form action={savePricingRule} className="mt-4 grid grid-cols-2 gap-3">
        <input type="hidden" name="item_id" value={item.id} />
        <div>
          <label className="text-xs font-medium">Metal</label>
          <select name="metal" defaultValue={p.metal ?? "gold"} className={inputCls}>
            {METALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium">Fine weight (oz)</label>
          <input
            name="fine_weight_oz"
            type="number"
            step="0.0001"
            defaultValue={p.fine_weight_oz ?? ""}
            placeholder="e.g. 0.9675"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-medium">% over spot</label>
          <input
            name="pct_over_spot"
            type="number"
            step="0.1"
            defaultValue={p.pct_over_spot ?? ""}
            placeholder="e.g. 4"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Floor (USD, optional)</label>
          <input
            name="floor"
            type="number"
            step="0.01"
            defaultValue={p.floor_cents != null ? p.floor_cents / 100 : ""}
            className={inputCls}
          />
        </div>

        <div className="col-span-2 mt-1 border-t pt-3 text-xs font-medium text-muted-foreground">
          Demand &amp; comps (optional)
        </div>
        <div>
          <label className="text-xs font-medium">Bump when popular (%)</label>
          <input
            name="demand_bump_pct"
            type="number"
            step="0.1"
            defaultValue={p.demand_bump_pct ?? ""}
            placeholder="e.g. 5"
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium">Popular at ≥ views</label>
            <input
              name="views_threshold"
              type="number"
              step="1"
              defaultValue={p.views_threshold ?? ""}
              placeholder="e.g. 50"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium">≥ watches</label>
            <input
              name="watches_threshold"
              type="number"
              step="1"
              defaultValue={p.watches_threshold ?? ""}
              placeholder="e.g. 3"
              className={inputCls}
            />
          </div>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="use_comp"
            defaultChecked={p.use_comp ?? false}
            className="h-4 w-4 rounded border"
          />
          Don&apos;t price below recent comparable sales (comps)
        </label>

        <div className="col-span-2">
          <Button type="submit" size="sm">
            {hasRule ? "Update rule" : "Set rule"}
          </Button>
        </div>
      </form>

      {hasRule && (
        <form action={removePricingRule} className="mt-2">
          <input type="hidden" name="item_id" value={item.id} />
          <button className="text-xs text-muted-foreground underline hover:text-foreground">
            Remove rule
          </button>
        </form>
      )}
    </div>
  );
}
