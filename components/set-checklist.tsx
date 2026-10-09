"use client";

import Link from "next/link";
import { useState } from "react";
import { CoinTileImage } from "@/components/coin-tile";

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
              className="group overflow-hidden rounded-md border border-border/60 bg-card transition-colors hover:border-foreground/40"
            >
              <div className="relative">
                {t.photoUrl ? (
                  <CoinTileImage src={t.photoUrl} alt={t.name} />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
                <span className="absolute left-2.5 top-2.5 z-10 rounded-sm bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
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
              className="flex flex-col overflow-hidden rounded-md border border-dashed border-border/70 bg-muted/15"
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
                      On your Wants ✓
                    </Link>
                  ) : (
                    <Link
                      href={t.wantHref}
                      className="text-xs font-medium underline underline-offset-2 hover:text-foreground"
                    >
                      + Add to Wants
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
