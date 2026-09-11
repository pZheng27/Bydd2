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
