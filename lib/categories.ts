// The fixed "what I carry" menu. Each dealer selects the subset they carry
// (stored in dealers.categories). See SPEC.md §5.
export const DEALER_CATEGORIES = [
  "Morgan & Peace Dollars",
  "Early Copper",
  "Type Gold",
  "Modern Bullion",
  "Seated Coinage",
  "Commemoratives",
  "World",
  "Currency",
] as const;

export type DealerCategory = (typeof DEALER_CATEGORIES)[number];

/**
 * Rough map from a coin's series to a dealer category, for routing's +20 line.
 * Deliberately loose (substring match) and easy to tweak. Series with no clean
 * category (e.g. Mercury Dimes) return null and simply don't earn the +20.
 */
export function seriesToCategory(series: string | null): DealerCategory | null {
  if (!series) return null;
  const s = series.toLowerCase();
  if (s.includes("morgan") || s.includes("peace")) return "Morgan & Peace Dollars";
  if (s.includes("type gold") || s.includes("gold")) return "Type Gold";
  if (s.includes("lincoln") || s.includes("cent")) return "Early Copper";
  return null;
}
