import { describe, it, expect } from "vitest";
import { evaluateRule, spotPlusPctPrice } from "./pricing";

const goldRule = {
  kind: "spot_plus_pct" as const,
  metal: "gold" as const,
  fineWeightOz: 0.9675,
  pctOverSpot: 4,
};

describe("spotPlusPctPrice", () => {
  it("computes spot × weight × (1 + pct)", () => {
    // $2,641/oz × 0.9675 oz × 1.04 ≈ $2,657.37
    expect(spotPlusPctPrice(264100, 0.9675, 4)).toBe(265737);
  });
});

describe("evaluateRule (spot_plus_pct)", () => {
  it("prices off spot when there are no guardrails", () => {
    const r = evaluateRule({
      currentPriceCents: 250000,
      rule: goldRule,
      guardrails: {},
      context: { spotPerOzCents: 264100 },
    });
    expect(r.priceCents).toBe(265737);
    expect(r.changed).toBe(true);
  });

  it("returns the current price unchanged when spot is unknown", () => {
    const r = evaluateRule({
      currentPriceCents: 250000,
      rule: goldRule,
      guardrails: {},
      context: { spotPerOzCents: null },
    });
    expect(r.priceCents).toBe(250000);
    expect(r.changed).toBe(false);
  });

  it("never prices below the floor", () => {
    const r = evaluateRule({
      currentPriceCents: 250000,
      rule: goldRule,
      guardrails: { floorCents: 300000 },
      context: { spotPerOzCents: 264100 },
    });
    expect(r.priceCents).toBe(300000);
    expect(r.applied.floor).toBe(true);
  });

  it("never prices below cost", () => {
    const r = evaluateRule({
      currentPriceCents: 250000,
      rule: goldRule,
      guardrails: { costCents: 280000 },
      context: { spotPerOzCents: 264100 },
    });
    expect(r.priceCents).toBe(280000);
    expect(r.applied.cost).toBe(true);
  });

  it("limits how far the price moves in one step", () => {
    // base ≈ $2,657 is a >5% jump from $2,500 → clamp to +5% = $2,625
    const r = evaluateRule({
      currentPriceCents: 250000,
      rule: goldRule,
      guardrails: { maxDailyMovePct: 5 },
      context: { spotPerOzCents: 264100 },
    });
    expect(r.priceCents).toBe(262500);
    expect(r.applied.dailyMove).toBe(true);
  });
});
