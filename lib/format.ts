/** Format integer cents as USD, or an em dash when empty. */
export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** A short grade label, e.g. "PCGS 65 PL". */
export function gradeLabel(item: {
  grading_service?: string | null;
  grade?: number | null;
  designation?: string | null;
}): string {
  const parts = [item.grading_service, item.grade, item.designation].filter(
    (p) => p !== null && p !== undefined && p !== "",
  );
  return parts.length ? parts.join(" ") : "—";
}
