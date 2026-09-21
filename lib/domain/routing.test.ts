import { describe, it, expect } from "vitest";
import {
  routeWant,
  scoreDealer,
  exactMatchPoints,
  type Want,
  type DealerSignals,
} from "./routing";

const WANT: Want = {
  coinTypeId: "ct-1889cc",
  series: "Morgan Dollar",
  category: "Morgan & Peace Dollars",
  gradeMin: 50,
  gradeMax: 63,
};

function dealer(over: Partial<DealerSignals> = {}): DealerSignals {
  return {
    dealerId: "d1",
    acceptsRequests: true,
    exactListedGrades: [],
    exactListedUngraded: false,
    seriesListedCount: 0,
    categories: [],
    responseRate: null,
    requestsToday: 0,
    declinedThisWant: false,
    ...over,
  };
}
const total = (w: Want, d: DealerSignals) => scoreDealer(w, d).score;

describe("exactMatchPoints", () => {
  it("+100 when a listed grade is within range", () => {
    expect(exactMatchPoints(WANT, dealer({ exactListedGrades: [58] }))).toBe(100);
  });
  it("+60 when a listed grade is within 5 of the range (either side)", () => {
    expect(exactMatchPoints(WANT, dealer({ exactListedGrades: [45] }))).toBe(60); // 50-45=5
    expect(exactMatchPoints(WANT, dealer({ exactListedGrades: [68] }))).toBe(60); // 68-63=5
  });
  it("0 when a listed grade is more than 5 off", () => {
    expect(exactMatchPoints(WANT, dealer({ exactListedGrades: [44] }))).toBe(0);
    expect(exactMatchPoints(WANT, dealer({ exactListedGrades: [69] }))).toBe(0);
  });
  it("0 when the dealer doesn't list the exact coin", () => {
    expect(exactMatchPoints(WANT, dealer())).toBe(0);
  });
  it("0 when the want has no catalog link", () => {
    expect(
      exactMatchPoints({ ...WANT, coinTypeId: null }, dealer({ exactListedGrades: [58] })),
    ).toBe(0);
  });
  it("+100 with no grade range if the dealer lists the coin (even ungraded)", () => {
    const noRange = { ...WANT, gradeMin: null, gradeMax: null };
    expect(exactMatchPoints(noRange, dealer({ exactListedUngraded: true }))).toBe(100);
  });
  it("0 for an ungraded listing when a grade range is set (can't confirm)", () => {
    expect(exactMatchPoints(WANT, dealer({ exactListedUngraded: true }))).toBe(0);
  });
});

describe("scoreDealer — each line", () => {
  it("+30 for a series specialist (≥3 listed in series), 0 for fewer", () => {
    expect(total(WANT, dealer({ seriesListedCount: 3 }))).toBe(30);
    expect(total(WANT, dealer({ seriesListedCount: 2 }))).toBe(0);
  });
  it("+20 when the dealer carries the coin's category", () => {
    expect(total(WANT, dealer({ categories: ["Morgan & Peace Dollars"] }))).toBe(20);
    expect(total(WANT, dealer({ categories: ["World"] }))).toBe(0);
  });
  it("response_rate × 15 (0..15)", () => {
    expect(total(WANT, dealer({ responseRate: 1 }))).toBe(15);
    expect(total(WANT, dealer({ responseRate: 0.5 }))).toBe(8); // round(7.5)
    expect(total(WANT, dealer({ responseRate: 0 }))).toBe(0);
    expect(total(WANT, dealer({ responseRate: null }))).toBe(0);
  });
  it("−25 fatigue at ≥5 requests today, none at 4", () => {
    expect(total(WANT, dealer({ requestsToday: 5 }))).toBe(-25);
    expect(total(WANT, dealer({ requestsToday: 4 }))).toBe(0);
  });
  it("−100 if the dealer declined this want before", () => {
    expect(total(WANT, dealer({ declinedThisWant: true }))).toBe(-100);
  });
  it("sums lines and lists only the ones that applied", () => {
    const s = scoreDealer(
      WANT,
      dealer({
        exactListedGrades: [58], // +100
        seriesListedCount: 5, // +30
        categories: ["Morgan & Peace Dollars"], // +20
        responseRate: 1, // +15
      }),
    );
    expect(s.score).toBe(165);
    expect(s.lines).toHaveLength(4);
  });
});

describe("routeWant", () => {
  it("ignores dealers that don't accept requests", () => {
    const r = routeWant(WANT, [
      dealer({ dealerId: "off", acceptsRequests: false, exactListedGrades: [58] }),
    ]);
    expect(r.considered).toHaveLength(0);
    expect(r.requests).toHaveLength(0);
    expect(r.reason).toMatch(/No dealer/);
  });

  it("keeps only scores ≥ 20 in requests (but lists all in considered)", () => {
    const weak = dealer({ dealerId: "weak", responseRate: 1 }); // 15 < 20
    const ok = dealer({ dealerId: "ok", categories: ["Morgan & Peace Dollars"] }); // 20
    const r = routeWant(WANT, [weak, ok]);
    expect(r.requests.map((x) => x.dealerId)).toEqual(["ok"]);
    expect(r.considered.map((x) => x.dealerId).sort()).toEqual(["ok", "weak"]);
  });

  it("returns the top 3 qualifiers, best first", () => {
    const r = routeWant(WANT, [
      dealer({ dealerId: "a", exactListedGrades: [58] }), // 100
      dealer({ dealerId: "b", seriesListedCount: 4 }), // 30
      dealer({ dealerId: "c", categories: ["Morgan & Peace Dollars"] }), // 20
      dealer({ dealerId: "d", seriesListedCount: 9, categories: ["Morgan & Peace Dollars"] }), // 50
    ]);
    expect(r.requests.map((x) => x.dealerId)).toEqual(["a", "d", "b"]);
  });

  it("leaves the want unrouted when nobody clears the cutoff", () => {
    const r = routeWant(WANT, [dealer({ dealerId: "x", responseRate: 0.5 })]); // 8
    expect(r.requests).toHaveLength(0);
    expect(r.reason).toBeDefined();
  });

  it("breaks score ties by dealerId for a stable order", () => {
    const r = routeWant(WANT, [
      dealer({ dealerId: "zeta", categories: ["Morgan & Peace Dollars"] }),
      dealer({ dealerId: "alpha", categories: ["Morgan & Peace Dollars"] }),
    ]);
    expect(r.requests.map((x) => x.dealerId)).toEqual(["alpha", "zeta"]);
  });
});
