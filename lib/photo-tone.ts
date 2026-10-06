// Brightness / contrast for coin photos. The thumbnails preview it with a CSS
// filter (instant); the composite canvas and the saved photo apply the same
// maths to the pixels here, so all three look identical.

/** Percentages: 100 = unchanged. */
export type Tone = { brightness: number; contrast: number };

export const DEFAULT_TONE: Tone = { brightness: 100, contrast: 100 };
// Slider ranges, in percent. Brightness goes from black (0) to double (200);
// contrast stays within ±50%.
export const TONE_RANGE: Record<keyof Tone, [number, number]> = {
  brightness: [0, 200],
  contrast: [50, 150],
};

export function isNeutralTone(t: Tone): boolean {
  return t.brightness === 100 && t.contrast === 100;
}

/** The matching CSS filter, for a live on-screen preview. */
export function toneCss(t: Tone): string | undefined {
  return isNeutralTone(t)
    ? undefined
    : `brightness(${t.brightness}%) contrast(${t.contrast}%)`;
}

export const toneKey = (t: Tone) => `${t.brightness}/${t.contrast}`;

/**
 * Apply brightness then contrast to RGBA pixels in place, matching the CSS
 * `brightness() contrast()` filter: brightness multiplies each channel,
 * contrast pushes it away from mid-grey; each step clamps to 0-255. Alpha
 * (the cut-out's transparency) is left untouched.
 */
export function applyTone(px: Uint8ClampedArray, t: Tone): void {
  if (isNeutralTone(t)) return;
  const b = t.brightness / 100;
  const c = t.contrast / 100;
  // One lookup table for all 256 channel values — fast enough for live dragging.
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const bright = Math.min(255, v * b);
    lut[v] = (bright - 127.5) * c + 127.5;
  }
  for (let i = 0; i < px.length; i += 4) {
    px[i] = lut[px[i]];
    px[i + 1] = lut[px[i + 1]];
    px[i + 2] = lut[px[i + 2]];
  }
}
