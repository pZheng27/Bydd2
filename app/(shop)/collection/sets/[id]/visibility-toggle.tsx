"use client";

import { setSetVisibility } from "../actions";

/**
 * Public/private toggle for a set. Clicking submits the opposite state; the
 * server action saves it and redirects back.
 */
export function VisibilityToggle({
  setId,
  isPublic,
}: {
  setId: string;
  isPublic: boolean;
}) {
  return (
    <form action={setSetVisibility}>
      <input type="hidden" name="id" value={setId} />
      <input type="hidden" name="is_public" value={(!isPublic).toString()} />
      <button
        type="submit"
        aria-pressed={isPublic}
        className={
          "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors " +
          (isPublic
            ? "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
            : "text-muted-foreground hover:bg-muted")
        }
      >
        <span
          className={
            "h-2 w-2 rounded-full " +
            (isPublic ? "bg-emerald-500" : "bg-muted-foreground/40")
          }
        />
        {isPublic ? "Public — shown on your profile" : "Private — only you"}
      </button>
    </form>
  );
}
