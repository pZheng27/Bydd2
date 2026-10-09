import Link from "next/link";
import type { ReactNode } from "react";
import { CoinPhotos } from "@/components/coin-photos";

/**
 * The single-coin page layout, shared by the owner's own coin page and a
 * visitor's view of a coin in someone's public collection, so both look the
 * same: breadcrumb, photo gallery on the left, title / grade / description on
 * the right. Owner-only details (price paid, cert, Sell / Remove) are passed in
 * by the owner page as `meta`, `badge` and `children`; the public page passes
 * none of them.
 */
export function CoinDetail({
  crumbs,
  title,
  grade,
  meta,
  badge,
  description,
  photos,
  original,
  children,
}: {
  crumbs: { href: string; label: string }[];
  title: string | null;
  grade: string;
  meta?: string; // extra text after the grade, e.g. " · Cert 12345"
  badge?: ReactNode;
  description?: string | null;
  photos: string[]; // storage paths, primary first
  original?: string[];
  children?: ReactNode; // owner-only details and actions
}) {
  const name = title || "Untitled Coin";
  const hasGrade = !!grade && grade !== "—";
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {crumbs.map((c) => (
          <span key={c.href} className="flex items-center gap-2">
            <Link href={c.href} className="hover:underline">
              {c.label}
            </Link>
            <span>/</span>
          </span>
        ))}
        <span className="truncate">{name}</span>
      </div>

      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        <CoinPhotos photos={photos} original={original} />

        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          {(hasGrade || meta) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {hasGrade ? grade : ""}
              {meta ?? ""}
            </p>
          )}
          {badge}

          {description?.trim() && (
            <div className="mt-4 text-sm">
              <div className="text-xs font-medium text-muted-foreground">
                Description
              </div>
              <p className="mt-1 whitespace-pre-line">{description}</p>
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
