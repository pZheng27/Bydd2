import { evaluateRule, type Metal } from "@/lib/domain/pricing";
import { fmtMoney } from "@/lib/format";
import { METALS } from "@/lib/coins";
import {
  savePricingRule,
  removePricingRule,
  tickSpot,
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
};

export function PricingPanel({
  item,
  rule,
  spotCents,
}: {
  item: PanelItem;
  rule: { params: RuleParams } | null;
  spotCents: number | null;
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
          context: { spotPerOzCents: spotCents },
          guardrails: {
            floorCents: p.floor_cents ?? null,
            costCents: item.cost_cents ?? null,
            maxDailyMovePct: p.max_daily_move_pct ?? null,
          },
        })
      : null;

  const bounds = preview
    ? [
        preview.applied.floor && "floor",
        preview.applied.cost && "cost",
        preview.applied.dailyMove && "max move",
      ].filter(Boolean)
    : [];

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Pricing rule</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Gold: {spotCents != null ? `${fmtMoney(spotCents)}/oz` : "—"}
          </span>
          <form action={tickSpot}>
            <input type="hidden" name="item_id" value={item.id} />
            <button className="rounded-md border px-2 py-1 hover:bg-muted">
              Simulate gold tick
            </button>
          </form>
        </div>
      </div>

      {preview && (
        <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
          Suggested price:{" "}
          <span className="font-semibold">{fmtMoney(preview.priceCents)}</span>{" "}
          <span className="text-muted-foreground">
            (current {fmtMoney(item.price_cents)})
          </span>
          {bounds.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              bounded by {bounds.join(", ")}
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            Preview — automatic repricing + history arrive in Part B.
          </div>
        </div>
      )}

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
