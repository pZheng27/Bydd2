// Deterministic pricing engine for item agents (Session 3, Part A).
// Pure functions — no DB, no I/O — so they're easy to unit-test.
// Built "signal-ready": the context carries spot now, and views/watches/comps/
// time for later parts. Prices always move by rule, predictably and explainably.

export type Metal = "gold" | "silver" | "copper" | "nickel" | "clad" | "other";

/** Signals a rule can use. Spot is used now; the rest arrive in Part C. */
export type PricingContext = {
  /** Latest spot for the item's metal, in cents per troy ounce. */
  spotPerOzCents: number | null;
  views?: number;
  watches?: number;
  compCents?: number | null;
  now?: Date;
};

export type SpotPlusPct = {
  kind: "spot_plus_pct";
  metal: Metal;
  fineWeightOz: number;
  pctOverSpot: number;
};

/** The primary rule that produces a base price. More kinds arrive in Part C. */
export type PrimaryRule = SpotPlusPct;

export type Guardrails = {
  /** Hard minimum from a floor rule, in cents. */
  floorCents?: number | null;
  /** Never price below what you paid, in cents. */
  costCents?: number | null;
};

export type EvaluateInput = {
  currentPriceCents: number;
  rule: PrimaryRule;
  context: PricingContext;
  guardrails?: Guardrails;
};

export type EvaluateResult = {
  /** Suggested price after the rule + guardrails, in cents. */
  priceCents: number;
  /** True if it differs from currentPriceCents. */
  changed: boolean;
  /** Which guardrails bound the result. */
  applied: { floor: boolean; cost: boolean };
};

const round = (n: number) => Math.round(n);

/** Base price for a spot-linked rule: spot/oz × fine weight × (1 + pct/100). */
export function spotPlusPctPrice(
  spotPerOzCents: number,
  fineWeightOz: number,
  pctOverSpot: number,
): number {
  return round(spotPerOzCents * fineWeightOz * (1 + pctOverSpot / 100));
}

/**
 * Evaluate a pricing rule against the current context, applying guardrails:
 * a floor and never-below-cost. Pure and deterministic. Returns the price
 * unchanged when it can't compute (e.g. no spot yet).
 */
export function evaluateRule(input: EvaluateInput): EvaluateResult {
  const { currentPriceCents, rule, context, guardrails = {} } = input;
  const applied = { floor: false, cost: false };

  // 1) Base price from the primary rule.
  let target: number | null = null;
  if (rule.kind === "spot_plus_pct") {
    if (context.spotPerOzCents == null) {
      return { priceCents: currentPriceCents, changed: false, applied };
    }
    target = spotPlusPctPrice(
      context.spotPerOzCents,
      rule.fineWeightOz,
      rule.pctOverSpot,
    );
  }
  if (target == null) {
    return { priceCents: currentPriceCents, changed: false, applied };
  }

  // 2) Hard minimums: floor, then cost.
  const hardMin = Math.max(guardrails.floorCents ?? 0, guardrails.costCents ?? 0);
  if (guardrails.floorCents != null && target < guardrails.floorCents) {
    applied.floor = true;
  }
  if (guardrails.costCents != null && target < guardrails.costCents) {
    applied.cost = true;
  }
  target = Math.max(target, hardMin);

  return { priceCents: target, changed: target !== currentPriceCents, applied };
}
