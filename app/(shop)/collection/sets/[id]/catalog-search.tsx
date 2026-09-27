"use client";

import { useMemo, useState } from "react";
import { addCoinsToSet } from "../actions";
import type { CoinType } from "@/lib/catalog";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

const MAX_RESULTS = 60;

/**
 * Search-to-add for the catalog. Instead of listing every catalog coin, the
 * collector types to find coins (by name, year, mintmark, series or variety)
 * and ticks the ones to add. Selections persist as the search is refined, so
 * several coins found across different searches can be added at once.
 */
export function CatalogCoinSearch({
  setId,
  addable,
}: {
  setId: string;
  addable: CoinType[];
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = q.trim().toLowerCase();
  const allMatches = useMemo(() => {
    if (!query) return [];
    const terms = query.split(/\s+/).filter(Boolean);
    return addable.filter((c) => {
      const hay =
        `${c.name} ${c.series} ${c.year ?? ""} ${c.mintmark ?? ""} ${c.variety ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [query, addable]);
  const matches = allMatches.slice(0, MAX_RESULTS);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={addCoinsToSet} className="mt-2 space-y-3">
      <input type="hidden" name="set_id" value={setId} />
      {/* Selected coins still submit even when the current search hides them. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="coin_type_id" value={id} />
      ))}

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={`Search ${addable.length} catalog coins — e.g. 1893-S, Morgan, Buffalo`}
        aria-label="Search the catalog"
        className={inputCls}
      />

      {query === "" ? (
        <p className="text-sm text-muted-foreground">
          Start typing to find catalog coins to add
          {selected.size > 0 ? ` — ${selected.size} selected so far` : ""}.
        </p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No catalog coins match &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <>
          <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-3">
            {matches.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4"
                />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
          {allMatches.length > MAX_RESULTS && (
            <p className="text-xs text-muted-foreground">
              Showing the first {MAX_RESULTS} of {allMatches.length} matches —
              keep typing to narrow it down.
            </p>
          )}
        </>
      )}

      <Button type="submit" disabled={selected.size === 0}>
        {selected.size > 0 ? `Add ${selected.size} selected` : "Add selected"}
      </Button>
    </form>
  );
}
