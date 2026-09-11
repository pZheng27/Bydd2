// Allowed values that mirror the CHECK constraints on inventory_items.
export const METALS = [
  "gold",
  "silver",
  "copper",
  "nickel",
  "clad",
  "other",
] as const;

export const GRADING_SERVICES = [
  "PCGS",
  "NGC",
  "CAC",
  "ANACS",
  "ICG",
  "raw",
] as const;

export const ITEM_STATUSES = [
  "listed",
  "unlisted",
  "reserved",
  "sold",
] as const;
