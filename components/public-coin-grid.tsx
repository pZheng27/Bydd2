import Link from "next/link";
import { CoinTileImage } from "@/components/coin-tile";

export type PublicCoin = {
  id: string;
  title: string;
  grade: string;
  description?: string;
  photos: string[]; // full URLs, primary first
};

/**
 * The coin grid on a public profile. Each coin links to its own page
 * (/u/[profile]/coin/[item]), laid out like the owner's coin page — so a
 * visitor sees someone's coin the same way the owner sees it.
 */
export function PublicCoinGrid({
  coins,
  profileId,
  setId,
}: {
  coins: PublicCoin[];
  profileId: string;
  setId: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {coins.map((c) => {
        const desc = c.description?.trim();
        const hasGrade = !!c.grade && c.grade !== "—";
        return (
          <Link
            key={c.id}
            href={`/u/${profileId}/coin/${c.id}?set=${setId}`}
            className="group flex flex-col justify-start overflow-hidden rounded-md border border-border/60 bg-card text-left transition-colors hover:border-foreground/40"
          >
            {c.photos[0] ? (
              <CoinTileImage src={c.photos[0]} alt={c.title} />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-muted/50 text-xs text-muted-foreground">
                No photo
              </div>
            )}
            <div className="p-3">
              <div className="truncate text-sm font-medium tracking-tight">
                {c.title || "Untitled Coin"}
              </div>
              {desc ? (
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {desc}
                </div>
              ) : null}
              {hasGrade ? (
                <div className="mt-0.5 text-xs text-muted-foreground/80">
                  {c.grade}
                </div>
              ) : !desc ? (
                <div className="mt-0.5 text-xs text-muted-foreground">—</div>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
