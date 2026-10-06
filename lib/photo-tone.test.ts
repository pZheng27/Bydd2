import { describe, expect, it } from "vitest";
import { applyTone, isNeutralTone, toneCss } from "./photo-tone";

const px = (...v: number[]) => new Uint8ClampedArray(v);

describe("applyTone", () => {
  it("leaves pixels alone at 100% / 100%", () => {
    const p = px(10, 128, 250, 200);
    applyTone(p, { brightness: 100, contrast: 100 });
    expect([...p]).toEqual([10, 128, 250, 200]);
  });

  it("brightness scales channels and clamps at white", () => {
    const p = px(100, 200, 0, 255);
    applyTone(p, { brightness: 150, contrast: 100 });
    expect([...p]).toEqual([150, 255, 0, 255]);
  });

  it("contrast pushes away from mid-grey", () => {
    const p = px(64, 192, 128, 255);
    applyTone(p, { brightness: 100, contrast: 150 });
    expect(p[0]).toBeLessThan(64);
    expect(p[1]).toBeGreaterThan(192);
    expect(Math.abs(p[2] - 128)).toBeLessThanOrEqual(1);
  });

  it("never touches alpha (cut-out transparency)", () => {
    const p = px(100, 100, 100, 37);
    applyTone(p, { brightness: 140, contrast: 60 });
    expect(p[3]).toBe(37);
  });
});

describe("toneCss", () => {
  it("is empty when neutral and a filter otherwise", () => {
    expect(isNeutralTone({ brightness: 100, contrast: 100 })).toBe(true);
    expect(toneCss({ brightness: 100, contrast: 100 })).toBeUndefined();
    expect(toneCss({ brightness: 120, contrast: 90 })).toBe(
      "brightness(120%) contrast(90%)",
    );
  });
});
