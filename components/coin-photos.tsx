"use client";

import { useState } from "react";
import { publicPhotoUrl } from "@/lib/photos";
import { Lightbox } from "@/components/lightbox";

/**
 * Coin photo viewer. Shows the display photos (auto-enhanced when available)
 * with a small "View original photo" toggle whenever the raw upload was kept
 * for that image. Clicking the main image opens a full-size overlay; clicking
 * the backdrop, the ✕, or pressing Escape closes it. Images are never cropped
 * (object-contain), so the whole coin always shows.
 */
export function CoinPhotos({
  photos,
  original = [],
}: {
  photos: string[];
  original?: string[];
}) {
  const [active, setActive] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  if (photos.length === 0) {
    return <div className="aspect-square w-full rounded-xl border bg-muted" />;
  }

  const rawForActive = original[active] || "";
  const hasOriginal = rawForActive.length > 0;
  const shownPath = showOriginal && hasOriginal ? rawForActive : photos[active];
  const shownUrl = publicPhotoUrl(shownPath);

  return (
    <>
      <div className="space-y-3">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shownUrl}
            alt=""
            onClick={() => setZoomUrl(shownUrl)}
            className="aspect-square w-full cursor-zoom-in rounded-xl border bg-muted object-contain"
          />
          {hasOriginal && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="absolute bottom-2 right-2 rounded-full border bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur hover:bg-background"
            >
              {showOriginal ? "View enhanced" : "View original photo"}
            </button>
          )}
        </div>
        {photos.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setActive(i);
                  setShowOriginal(false);
                }}
                className={
                  "overflow-hidden rounded-md border bg-muted " +
                  (i === active ? "ring-2 ring-ring" : "hover:opacity-90")
                }
                aria-label={`View photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicPhotoUrl(p)}
                  alt=""
                  className="aspect-square w-full object-contain"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {zoomUrl && <Lightbox src={zoomUrl} onClose={() => setZoomUrl(null)} />}
    </>
  );
}
