"use client";

import { deleteCollectionSet } from "../actions";

/**
 * Delete-set control. Freeform sets delete their coins too, so this asks for
 * confirmation before the irreversible action.
 */
export function DeleteSetForm({
  setId,
  isSeries,
}: {
  setId: string;
  isSeries: boolean;
}) {
  return (
    <form
      action={deleteCollectionSet}
      onSubmit={(e) => {
        const msg = isSeries
          ? "Delete this set? Your coins stay in your collection."
          : "Delete this set and permanently delete its coins from your collection? This cannot be undone.";
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={setId} />
      <button className="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-muted">
        Delete this Set
      </button>
    </form>
  );
}
