"use client";

import Link from "next/link";
import { CoinTileImage } from "@/components/coin-tile";
import { deleteCollectionItem } from "@/app/(shop)/collection/actions";

/**
 * A coin tile in the owner's own collection grid. The whole card links to the
 * coin's detail page; hovering (or focusing) reveals Edit and Delete controls
 * so the owner can manage a coin without opening it first. Delete confirms and
 * returns to the same set.
 */
export function OwnedCoinCard({
  id,
  title,
  grade,
  description,
  photo,
  setId,
}: {
  id: string;
  title: string;
  grade: string;
  description?: string;
  photo: string | null;
  setId: string;
}) {
  const hasGrade = !!grade && grade !== "—";
  const desc = description?.trim();
  return (
    <div className="group relative overflow-hidden rounded-md border border-border/60 bg-card transition-colors hover:border-foreground/40">
      <Link href={`/collection/${id}`} className="block">
        {photo ? (
          <CoinTileImage src={photo} alt={title} />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-muted/50 text-xs text-muted-foreground">
            No photo
          </div>
        )}
        <div className="p-3">
          <div className="truncate text-sm font-medium tracking-tight">
            {title || "Untitled Coin"}
          </div>
          {desc ? (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {desc}
            </div>
          ) : null}
          {hasGrade ? (
            <div className="mt-0.5 text-xs text-muted-foreground/80">{grade}</div>
          ) : !desc ? (
            <div className="mt-0.5 text-xs text-muted-foreground">—</div>
          ) : null}
        </div>
      </Link>

      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Link
          href={`/collection/${id}/edit?from=${setId}`}
          aria-label="Edit Coin"
          className="rounded-sm border bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm hover:bg-background"
        >
          Edit
        </Link>
        <form
          action={deleteCollectionItem}
          onSubmit={(e) => {
            if (
              !window.confirm(
                `Delete "${title || "this coin"}" from your collection? This can't be undone.`,
              )
            )
              e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="set" value={setId} />
          <button
            type="submit"
            aria-label="Delete coin"
            className="rounded-sm border bg-background/90 px-2.5 py-1 text-xs font-medium text-destructive shadow-sm hover:bg-background"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
