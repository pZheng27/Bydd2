// Deterministic pricing engine for item agents (Session 3).
// Pure functions — no DB, no I/O — so they're easy to unit-test.
// Prices always move by rule, predictably and explainably.
//
// Guardrails and signals are OPT-IN per rule: a rule uses only what it sets.
// The chat (Session 3.5) is how sellers turn these on in plain English.

export type Metal = "gold" | "silver" | "copper" | "nickel" | "clad" | "other";

/** Signals a rule can use. */
export type PricingContext = {
  /** Latest spot for the item's metal, in cents per troy ounce. */
  spotPerOzCents: number | null;
  /** Views this listing has had. */
  views?: number;
  /** How many buyers are watching (saved) it. */
  watches?: number;
  /** A comp — what a similar coin recently sold for, in cents. */
  compCents?: number | null;
  now?: Date;
};

export type SpotPlusPct = {
  kind: "spot_plus_pct";
  metal: Metal;
  fineWeightOz: number;
  pctOverSpot: number;
};

/** The primary rule that produces a base price. More kinds arrive later. */
export type PrimaryRule = SpotPlusPct;

/** Demand-driven adjustments layered on top of the base price. */
export type DemandSignals = {
  /** % added to the base when interest is "high". */
  demandBumpPct?: number | null;
  /** views ≥ this counts as high interest. */
  viewsThreshold?: number | null;
  /** watches ≥ this counts as high interest. */
  watchesThreshold?: number | null;
  /** Treat the comp (recent similar sale) as a soft floor. */
  useComp?: boolean;
};

export type Guardrails = {
  /** Hard minimum from a floor rule, in cents. */
  floorCents?: number | null;
  /** Never price below what you paid, in cents. */
  costCents?: number | null;
  /** Optional cap on how far the price may move per evaluation (off unless set). */
  maxDailyMovePct?: number | null;
};

export type EvaluateInput = {
  currentPriceCents: number;
  rule: PrimaryRule;
  context: PricingContext;
  guardrails?: Guardrails;
  signals?: DemandSignals;
};

export type EvaluateResult = {
  /** Suggested price after the rule, signals, and guardrails, in cents. */
  priceCents: number;
  /** True if it differs from currentPriceCents. */
  changed: boolean;
  /** Which adjustments/guardrails shaped the result. */
  applied: {
    floor: boolean;
    cost: boolean;
    dailyMove: boolean;
    demand: boolean;
    comp: boolean;
  };
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
 * Evaluate a pricing rule against the current context. Order: base price →
 * demand bump (views/watches) → hard minimums (floor, cost, comp) → optional
 * max-move cap. Pure and deterministic. Returns the price unchanged when it
 * can't compute (e.g. no spot yet).
 */
export function evaluateRule(input: EvaluateInput): EvaluateResult {
  const { currentPriceCents, rule, context, guardrails = {}, signals = {} } =
    input;
  const applied = {
    floor: false,
    cost: false,
    dailyMove: false,
    demand: false,
    comp: false,
  };

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

  // 2) Demand bump when interest is high (views or watches over a threshold).
  if (signals.demandBumpPct != null && signals.demandBumpPct !== 0) {
    const highViews =
      signals.viewsThreshold != null &&
      (context.views ?? 0) >= signals.viewsThreshold;
    const highWatches =
      signals.watchesThreshold != null &&
      (context.watches ?? 0) >= signals.watchesThreshold;
    if (highViews || highWatches) {
      target = round(target * (1 + signals.demandBumpPct / 100));
      applied.demand = true;
    }
  }

  // 3) Hard minimums: floor, cost, and (if enabled) the comp.
  const compFloor =
    signals.useComp && context.compCents != null ? context.compCents : 0;
  const hardMin = Math.max(
    guardrails.floorCents ?? 0,
    guardrails.costCents ?? 0,
    compFloor,
  );
  if (guardrails.floorCents != null && target < guardrails.floorCents) {
    applied.floor = true;
  }
  if (guardrails.costCents != null && target < guardrails.costCents) {
    applied.cost = true;
  }
  if (compFloor > 0 && target < compFloor) applied.comp = true;
  target = Math.max(target, hardMin);

  // 4) Optional max-move cap (opt-in per rule; off unless set).
  if (
    guardrails.maxDailyMovePct != null &&
    guardrails.maxDailyMovePct > 0 &&
    currentPriceCents > 0
  ) {
    const up = round(currentPriceCents * (1 + guardrails.maxDailyMovePct / 100));
    const down = round(currentPriceCents * (1 - guardrails.maxDailyMovePct / 100));
    const clamped = Math.min(Math.max(target, down), up);
    if (clamped !== target) applied.dailyMove = true;
    target = Math.max(clamped, hardMin);
  }

  return { priceCents: target, changed: target !== currentPriceCents, applied };
}
