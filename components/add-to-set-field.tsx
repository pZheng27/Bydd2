"use client";

import { useState } from "react";

export type SetCoin = { id: string; name: string };
export type SetOption = {
  id: string;
  name: string;
  kind: "series" | "freeform";
  coins: SetCoin[];
};

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * Add-coin form field: choose which of the collector's sets this coin goes into.
 * For a series set (a catalog checklist like the CC Morgans) it then asks which
 * coin in the set — picking it checks that coin off. Freeform sets just hold the
 * coin. Emits `collection_set_id` and (for series) `coin_type_id`.
 */
export function AddToSetField({ sets }: { sets: SetOption[] }) {
  const [setId, setSetId] = useState("");
  const selected = sets.find((s) => s.id === setId);

  return (
    <>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="collection_set_id">
          Add to set
        </label>
        <select
          id="collection_set_id"
          name="collection_set_id"
          required
          value={setId}
          onChange={(e) => setSetId(e.target.value)}
          className={inputCls}
        >
          <option value="" disabled>
            — Select a set —
          </option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.kind === "series" ? " (checklist)" : ""}
            </option>
          ))}
        </select>
      </div>

      {selected?.kind === "series" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="coin_type_id">
            Which coin in {selected.name}?
          </label>
          <select
            key={selected.id}
            id="coin_type_id"
            name="coin_type_id"
            required
            defaultValue=""
            className={inputCls}
          >
            <option value="" disabled>
              — pick the coin to check it off —
            </option>
            {selected.coins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Marks this coin as owned in the set.
          </p>
        </div>
      )}

      {selected?.kind === "freeform" && (
        <p className="text-xs text-muted-foreground">
          This coin will be added to &ldquo;{selected.name}.&rdquo;
        </p>
      )}
    </>
  );
}
