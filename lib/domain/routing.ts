// Deterministic routing engine (Session 6). Pure functions — no DB, no I/O —
// so they're easy to unit-test.
//
// Routing is a PREDICTION, not a lookup. Dealers don't keep their unlisted
// back-stock in the app, so we predict which dealer most likely has a wanted
// coin from their LISTINGS + profile: a live listing of the exact coin is the
// one certain signal; the series-specialist and category signals carry the rest
// (they stand in for "probably has more of this in the back").

export type Want = {
  /** Catalog id of the wanted coin. Null → no exact match is possible. */
  coinTypeId: string | null;
  /** Series (e.g. "Morgan Dollar") for the specialist signal. */
  series: string | null;
  /** The dealer-category this coin belongs to, for the +20 line. */
  category: string | null;
  gradeMin: number | null;
  gradeMax: number | null;
};

export type DealerSignals = {
  dealerId: string;
  acceptsRequests: boolean;
  /** Grades of this dealer's LISTED items of the wanted coin_type. */
  exactListedGrades: number[];
  /** Dealer lists the wanted coin_type but with no grade recorded. */
  exactListedUngraded: boolean;
  /** How many LISTED items the dealer has in the wanted series. */
  seriesListedCount: number;
  /** The categories the dealer carries (dealers.categories). */
  categories: string[];
  /** Response rate 0..1, or null if unknown. */
  responseRate: number | null;
  /** Requests already routed to this dealer today (fatigue guard). */
  requestsToday: number;
  /** Dealer declined this same want before. */
  declinedThisWant: boolean;
};

export type ScoreLine = { label: string; points: number };
export type DealerScore = { dealerId: string; score: number; lines: ScoreLine[] };

export type RouteResult = {
  /** Who to send the request to: score ≥ MIN_SCORE, top MAX_REQUESTS, best first. */
  requests: DealerScore[];
  /** Every accepts-requests dealer scored, best first (for admin/audit). */
  considered: DealerScore[];
  /** Set when nobody qualifies, e.g. "No dealer scored ≥ 20". */
  reason?: string;
};

export const MIN_SCORE = 20;
export const MAX_REQUESTS = 3;
export const FATIGUE_LIMIT = 5; // ≥ this many requests today → fatigue penalty
export const GRADE_NEAR = 5; // "grade outside range by ≤ 5 points"

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The exact-match contribution: +100 when the dealer lists the exact coin in the
 * wanted grade range, +60 when a listed grade is within GRADE_NEAR of the range,
 * else 0. With no grade range, simply listing the coin is +100. An ungraded
 * listing can't confirm a grade, so it only counts when there's no range.
 */
export function exactMatchPoints(want: Want, d: DealerSignals): 100 | 60 | 0 {
  if (want.coinTypeId == null) return 0;
  const listsExact = d.exactListedGrades.length > 0 || d.exactListedUngraded;
  if (!listsExact) return 0;

  const noRange = want.gradeMin == null && want.gradeMax == null;
  if (noRange) return 100;

  const lo = want.gradeMin ?? Number.NEGATIVE_INFINITY;
  const hi = want.gradeMax ?? Number.POSITIVE_INFINITY;
  if (d.exactListedGrades.some((g) => g >= lo && g <= hi)) return 100;
  if (
    d.exactListedGrades.some(
      (g) => (g < lo && lo - g <= GRADE_NEAR) || (g > hi && g - hi <= GRADE_NEAR),
    )
  )
    return 60;
  return 0;
}

/** Score one dealer for a want. Returns the total and the lines that applied. */
export function scoreDealer(want: Want, d: DealerSignals): DealerScore {
  const lines: ScoreLine[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) lines.push({ label, points });
  };

  const exact = exactMatchPoints(want, d);
  if (exact === 100) add("Lists the exact coin, grade in range", 100);
  else if (exact === 60) add("Lists the exact coin, grade within 5", 60);

  if (want.series && d.seriesListedCount >= 3)
    add(`Specialist — lists ${d.seriesListedCount} in the series`, 30);

  if (want.category && d.categories.includes(want.category))
    add(`Carries the ${want.category} category`, 20);

  if (d.responseRate != null) {
    add("Responsiveness", Math.round(clamp01(d.responseRate) * 15));
  }

  if (d.requestsToday >= FATIGUE_LIMIT)
    add("Already busy with requests today", -25);

  if (d.declinedThisWant) add("Declined this want before", -100);

  const score = lines.reduce((s, l) => s + l.points, 0);
  return { dealerId: d.dealerId, score, lines };
}

/**
 * Predict the best dealers for a want. Scores every dealer that accepts
 * requests, keeps those scoring ≥ MIN_SCORE, and returns the top MAX_REQUESTS
 * (best first). Pure and deterministic; ties break by dealerId so the result is
 * stable. Callers should exclude the requester's own dealer from `dealers`.
 */
export function routeWant(want: Want, dealers: DealerSignals[]): RouteResult {
  const considered = dealers
    .filter((d) => d.acceptsRequests)
    .map((d) => scoreDealer(want, d))
    .sort((a, b) => b.score - a.score || a.dealerId.localeCompare(b.dealerId));

  const requests = considered
    .filter((d) => d.score >= MIN_SCORE)
    .slice(0, MAX_REQUESTS);

  return {
    requests,
    considered,
    reason:
      requests.length === 0 ? `No dealer scored ≥ ${MIN_SCORE}.` : undefined,
  };
}
