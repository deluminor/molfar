import { describe, expect, it } from "vitest";
import {
  advanceBrandTime,
  brandCanvasSize,
  shouldAnimateBrandVisual,
} from "./animation";

const visible = {
  hidden: false,
  reducedMotion: false,
  onScreen: true,
  width: 320,
  height: 240,
};

describe("shouldAnimateBrandVisual", () => {
  it("animates a visible, sized canvas", () => {
    expect(shouldAnimateBrandVisual(visible)).toBe(true);
  });

  it.each([
    ["the document is hidden", { hidden: true }],
    ["motion is reduced", { reducedMotion: true }],
    ["the card is off screen", { onScreen: false }],
    ["the canvas has no width", { width: 0 }],
    ["the canvas has no height", { height: 0 }],
  ])("stays still when %s", (_, override) => {
    expect(shouldAnimateBrandVisual({ ...visible, ...override })).toBe(false);
  });
});

describe("brandCanvasSize", () => {
  it("caps the device pixel ratio", () => {
    expect(brandCanvasSize(200, 100, 3)).toEqual({
      width: 400,
      height: 200,
      ratio: 2,
    });
  });

  it("falls back to 1x and never returns an empty buffer", () => {
    expect(brandCanvasSize(0, 0, 0)).toEqual({ width: 1, height: 1, ratio: 1 });
  });
});

describe("advanceBrandTime", () => {
  it("advances by the elapsed frame time", () => {
    expect(advanceBrandTime(1, 16)).toBeCloseTo(1.016);
  });

  it("clamps long gaps and ignores clock skew", () => {
    expect(advanceBrandTime(1, 5_000)).toBeCloseTo(1.1);
    expect(advanceBrandTime(1, -40)).toBe(1);
  });
});
