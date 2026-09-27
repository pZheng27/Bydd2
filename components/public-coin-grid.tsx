"use client";

import { useEffect, useState } from "react";
import { CoinTileImage } from "@/components/coin-tile";

export type PublicCoin = {
  id: string;
  title: string;
  grade: string;
  photos: string[]; // full URLs, primary first
};

/**
 * The coin grid on a public profile. Each coin is clickable and opens a detail
 * overlay with its photos (larger) and grade — so visitors can inspect an
 * individual coin in someone else's collection without leaving the page.
 */
export function PublicCoinGrid({ coins }: { coins: PublicCoin[] }) {
  const [active, setActive] = useState<PublicCoin | null>(null);
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {coins.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c)}
            className="group overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
                {c.title || "Untitled coin"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{c.grade}</div>
            </div>
          </button>
        ))}
      </div>
      {active && <CoinModal coin={active} onClose={() => setActive(null)} />}
    </>
  );
}

function CoinModal({
  coin,
  onClose,
}: {
  coin: PublicCoin;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const hero = coin.photos[idx] ?? coin.photos[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {hero ? (
            <CoinTileImage src={hero} alt={coin.title} />
          ) : (
            <div className="aspect-square w-full bg-muted" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-2 rounded-full border bg-background/90 px-2 py-1 text-xs font-medium shadow-sm hover:bg-background"
          >
            ✕
          </button>
        </div>

        {coin.photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pt-4">
            {coin.photos.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Photo ${i + 1}`}
                className={
                  "h-14 w-14 shrink-0 overflow-hidden rounded-md border " +
                  (i === idx ? "ring-2 ring-ring" : "hover:opacity-90")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="p-4">
          <div className="text-base font-semibold tracking-tight">
            {coin.title || "Untitled coin"}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{coin.grade}</div>
        </div>
      </div>
    </div>
  );
}
