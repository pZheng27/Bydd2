"use client";

import Link from "next/link";
import { useState } from "react";

export type ChecklistTile = {
  id: string;
  name: string;
  owned: boolean;
  photoUrl: string | null; // owned: the uploaded photo (may be null)
  label: string; // owned: grade label
  itemHref: string; // owned: link to the coin
  wanted: boolean; // missing: already on wants
  wantHref: string; // missing: add-to-wants link
};

/**
 * The set-completion grid for a preset (checklist) set, with a "Hide missing
 * coins" toggle so the collector can view just what they own.
 */
export function SetChecklist({
  tiles,
  ownedCount,
  total,
}: {
  tiles: ChecklistTile[];
  ownedCount: number;
  total: number;
}) {
  const [hideMissing, setHideMissing] = useState(false);
  const missingCount = total - ownedCount;
  const shown = hideMissing ? tiles.filter((t) => t.owned) : tiles;

  return (
    <>
      {missingCount > 0 && (
        <div className="mt-5 flex justify-end">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <input
              type="checkbox"
              checked={hideMissing}
              onChange={(e) => setHideMissing(e.target.checked)}
              className="h-4 w-4 accent-foreground"
            />
            Hide missing coins
          </label>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((t) =>
          t.owned ? (
            <Link
              key={t.id}
              href={t.itemHref}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative aspect-square overflow-hidden bg-gradient-to-b from-muted/40 to-muted/70 p-3">
                {t.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.photoUrl}
                    alt={t.name}
                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
                <span className="absolute left-2.5 top-2.5 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur">
                  ✓ Owned
                </span>
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium tracking-tight">
                  {t.name}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t.label}
                </div>
              </div>
            </Link>
          ) : (
            <div
              key={t.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-border/70 bg-muted/15"
            >
              <div className="flex aspect-square w-full items-center justify-center bg-muted/20 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Missing
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="truncate text-sm font-medium text-muted-foreground">
                  {t.name}
                </div>
                <div className="mt-auto pt-2">
                  {t.wanted ? (
                    <Link
                      href="/wants"
                      className="text-xs font-medium text-muted-foreground underline underline-offset-2"
                    >
                      On your wants ✓
                    </Link>
                  ) : (
                    <Link
                      href={t.wantHref}
                      className="text-xs font-medium underline underline-offset-2 hover:text-foreground"
                    >
                      + Add to wants
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ),
        )}
      </div>

      {hideMissing && ownedCount === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          You don&apos;t own any coins in this set yet.
        </p>
      )}
    </>
  );
}
