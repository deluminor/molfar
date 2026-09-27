import { describe, expect, it } from "vitest";
import { clockParts, msUntilNextSecond } from "./clock";
import { dragonDots, dragonEmitters, dragonTransform } from "./dragon";
import {
  DRAGON_COLUMNS,
  DRAGON_LINES,
  DRAGON_PADDING,
  DRAGON_VIEW_WIDTH,
  DRAGON_VIEW_HEIGHT,
} from "./dragon-constants";
import {
  MATRIX_GLYPHS,
  MATRIX_STEP_MS,
  advanceColumns,
  createColumns,
  shouldAnimateMatrix,
} from "./matrix";

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("clockParts", () => {
  it("separates the AM/PM suffix from the time in a 12-hour locale", () => {
    const parts = clockParts(new Date(2026, 8, 26, 14, 1), "en-US");
    expect(parts.time).toBe("02:01");
    expect(parts.period).toBe("PM");
    expect(parts.date).toBe("Saturday, September 26");
  });

  it("has no suffix in a 24-hour locale", () => {
    const parts = clockParts(new Date(2026, 8, 26, 14, 1), "uk-UA");
    expect(parts.time).toBe("14:01");
    expect(parts.period).toBeNull();
  });

  it("waits only until the next whole second", () => {
    expect(msUntilNextSecond(10_250)).toBe(750);
    expect(msUntilNextSecond(10_000)).toBe(1000);
  });
});

describe("dragon mark", () => {
  it("keeps every dot inside the declared grid", () => {
    const dots = dragonDots();
    expect(dots.length).toBeGreaterThan(200);
    for (const dot of dots) {
      expect(dot.x).toBeLessThan(DRAGON_COLUMNS);
      expect(dot.y).toBeLessThan(DRAGON_LINES);
      expect(dot.intensity).toBeGreaterThanOrEqual(0.35);
      expect(dot.intensity).toBeLessThanOrEqual(1);
    }
    expect(dots.some((dot) => dot.eye)).toBe(true);
  });

  it("is deterministic between renders", () => {
    expect(dragonDots()).toEqual(dragonDots());
  });

  it("exposes bottom emitters for falling pixels", () => {
    const emitters = dragonEmitters();
    expect(emitters.length).toBeGreaterThan(10);
    const byColumn = new Set(emitters.map((emitter) => emitter.x));
    expect(byColumn.size).toBe(emitters.length);
  });
});

describe("dragon fitting", () => {
  it.each([
    [160, 140],
    [320, 420],
    [600, 180],
    [180, 600],
  ])("fits uniformly in a %i by %i card", (width, height) => {
    const transform = dragonTransform(width, height);
    const left = transform.x - DRAGON_PADDING * transform.scale;
    const top = transform.y - DRAGON_PADDING * transform.scale;
    expect(left).toBeGreaterThanOrEqual(-1e-10);
    expect(top).toBeGreaterThanOrEqual(-1e-10);
    expect(left + DRAGON_VIEW_WIDTH * transform.scale).toBeLessThanOrEqual(
      width + 1e-10,
    );
    expect(top + DRAGON_VIEW_HEIGHT * transform.scale).toBeLessThanOrEqual(
      height + 1e-10,
    );
    expect(left).toBeCloseTo((width - DRAGON_VIEW_WIDTH * transform.scale) / 2);
    expect(top).toBeCloseTo(
      (height - DRAGON_VIEW_HEIGHT * transform.scale) / 2,
    );
  });

  it("collapses safely when the card has no area", () => {
    expect(dragonTransform(0, 0)).toEqual({ scale: 0, x: 0, y: 0 });
  });

  it("emits only from occupied cells with no silhouette beneath them", () => {
    const dots = dragonDots();
    for (const emitter of dragonEmitters(dots)) {
      expect(
        dots.some((dot) => dot.x === emitter.x && dot.y === emitter.y),
      ).toBe(true);
      expect(dots.some((dot) => dot.x === emitter.x && dot.y > emitter.y)).toBe(
        false,
      );
    }
    expect(dragonEmitters([])).toEqual([]);
    expect(dots.filter((dot) => dot.eye)).toHaveLength(2);
  });
});

describe("matrix rain", () => {
  it("starts every column at or above the top edge", () => {
    const columns = createColumns(8, 20, sequence(0.5, 0.1, 0.9));
    expect(columns).toHaveLength(8);
    expect(columns.every((column) => column.head <= 0)).toBe(true);
  });

  it("moves a drop down by its speed over one step", () => {
    const [next] = advanceColumns(
      [{ head: 3, speed: 0.5, length: 6 }],
      20,
      MATRIX_STEP_MS,
    );
    expect(next).toEqual({ head: 3.5, speed: 0.5, length: 6 });
  });

  it("scales motion with elapsed time for smooth frames", () => {
    const [next] = advanceColumns(
      [{ head: 3, speed: 0.5, length: 6 }],
      20,
      MATRIX_STEP_MS / 2,
    );
    expect(next?.head).toBeCloseTo(3.25);
  });

  it("respawns a drop above the canvas once its tail has left", () => {
    const [next] = advanceColumns(
      [{ head: 26.5, speed: 0.5, length: 6 }],
      20,
      MATRIX_STEP_MS,
      sequence(0.5),
    );
    expect(next.head).toBeLessThanOrEqual(0);
  });

  it("stays still under reduced motion or while hidden", () => {
    expect(shouldAnimateMatrix(false, false)).toBe(true);
    expect(shouldAnimateMatrix(true, false)).toBe(false);
    expect(shouldAnimateMatrix(false, true)).toBe(false);
  });

  it("draws katakana and digits only", () => {
    expect(MATRIX_GLYPHS).toMatch(/^[\u30A0-\u30FF0-9]+$/);
  });
});
