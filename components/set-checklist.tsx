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
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={hideMissing}
            onChange={(e) => setHideMissing(e.target.checked)}
            className="h-4 w-4"
          />
          Hide missing coins
          {hideMissing ? ` — showing ${ownedCount} owned` : ""}
        </label>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((t) =>
          t.owned ? (
            <Link
              key={t.id}
              href={t.itemHref}
              className="group overflow-hidden rounded-xl border transition-colors hover:bg-muted/40"
            >
              <div className="relative">
                {t.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.photoUrl}
                    alt={t.name}
                    className="aspect-square w-full bg-muted object-contain"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  ✓ Owned
                </span>
              </div>
              <div className="p-2">
                <div className="truncate text-xs font-medium">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">{t.label}</div>
              </div>
            </Link>
          ) : (
            <div
              key={t.id}
              className="flex flex-col overflow-hidden rounded-xl border border-dashed"
            >
              <div className="flex aspect-square w-full items-center justify-center bg-muted/30 text-[11px] font-medium text-muted-foreground">
                Missing
              </div>
              <div className="flex flex-1 flex-col p-2">
                <div className="truncate text-xs font-medium text-muted-foreground">
                  {t.name}
                </div>
                <div className="mt-auto pt-1.5">
                  {t.wanted ? (
                    <Link
                      href="/wants"
                      className="text-[11px] font-medium text-muted-foreground underline"
                    >
                      On your wants ✓
                    </Link>
                  ) : (
                    <Link
                      href={t.wantHref}
                      className="text-[11px] font-medium underline hover:text-foreground"
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
