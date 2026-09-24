import type { CoinType } from "@/lib/catalog";

// Denomination / grade words that appear across many series and so can't tell
// one coin from another — ignored when disambiguating by series.
const GENERIC = new Set([
  "dollar",
  "dollars",
  "cent",
  "cents",
  "dime",
  "half",
  "quarter",
  "quarters",
  "gold",
  "silver",
  "coin",
  "piece",
  "eagle",
  "type",
  "proof",
  "mint",
  "state",
  "uncirculated",
]);

/** Treat a blank or "P" mintmark as Philadelphia so titles that omit it match. */
function normMint(m: string | null | undefined): string {
  const v = (m ?? "").trim().toUpperCase();
  return v === "" || v === "P" ? "P" : v;
}

/**
 * Best-effort, deterministic match of a free-text coin title to a catalog coin,
 * using the year + mintmark + a distinctive series word. No AI, no network.
 *
 * Returns the catalog coin id, or null when there isn't a confident *single*
 * match — so a manual entry snaps to the right catalog coin when it clearly can,
 * and is simply left unlinked (never mislabeled) when it can't.
 *
 * Examples: "1881-S Morgan Dollar MS65 PCGS" -> the 1881-S Morgan; "1916-D
 * Mercury Dime" -> the 1916-D Mercury; "1921 Peace Dollar" -> the 1921 Peace
 * (not the 1921 Morgan).
 */
export function matchCatalogCoin(
  title: string,
  catalog: CoinType[],
): string | null {
  if (!title || catalog.length === 0) return null;
  const t = title.toLowerCase();

  // A year is required for confidence (first 4-digit year in the title).
  const ym = t.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
  if (!ym) return null;
  const year = Number(ym[1]);

  // Mintmark immediately after the year: "1881-s", "1889 cc", "1916d". Absent =
  // Philadelphia. ("cc" before the single letters so "1889-cc" reads as CC.)
  const mm = t.match(/\b(?:1[6-9]\d{2}|20\d{2})[\s-]*(cc|[dsopwc])\b/);
  const wantMint = mm ? normMint(mm[1]) : "P";

  const byYearMint = catalog.filter(
    (c) => c.year === year && normMint(c.mintmark) === wantMint,
  );
  if (byYearMint.length === 1) return byYearMint[0].id;
  if (byYearMint.length === 0) return null;

  // Several coins share that year + mintmark (across series): disambiguate by a
  // distinctive series/name word that appears in the title.
  const bySeries = byYearMint.filter((c) => {
    const words = `${c.series} ${c.name}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !GENERIC.has(w));
    return words.some((w) => t.includes(w));
  });
  return bySeries.length === 1 ? bySeries[0].id : null;
}
