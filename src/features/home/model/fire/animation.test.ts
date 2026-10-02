import { describe, expect, it } from "vitest";
import {
  advanceFireTime,
  fireCanvasSize,
  shouldAnimateFire,
} from "./animation";

const visible = {
  hidden: false,
  reducedMotion: false,
  onScreen: true,
  width: 320,
  height: 240,
};

describe("shouldAnimateFire", () => {
  it("animates a visible, sized canvas", () => {
    expect(shouldAnimateFire(visible)).toBe(true);
  });

  it.each([
    ["the document is hidden", { hidden: true }],
    ["motion is reduced", { reducedMotion: true }],
    ["the card is off screen", { onScreen: false }],
    ["the canvas has no width", { width: 0 }],
    ["the canvas has no height", { height: 0 }],
  ])("stays still when %s", (_, override) => {
    expect(shouldAnimateFire({ ...visible, ...override })).toBe(false);
  });
});

describe("fireCanvasSize", () => {
  it("caps the device pixel ratio", () => {
    expect(fireCanvasSize(200, 100, 3)).toEqual({
      width: 400,
      height: 200,
      ratio: 2,
    });
  });

  it("falls back to 1x and never returns an empty buffer", () => {
    expect(fireCanvasSize(0, 0, 0)).toEqual({ width: 1, height: 1, ratio: 1 });
  });
});

describe("advanceFireTime", () => {
  it("advances by the elapsed frame time", () => {
    expect(advanceFireTime(1, 16)).toBeCloseTo(1.016);
  });

  it("clamps long gaps and ignores clock skew", () => {
    expect(advanceFireTime(1, 5_000)).toBeCloseTo(1.1);
    expect(advanceFireTime(1, -40)).toBe(1);
  });
});
