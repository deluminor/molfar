import { describe, expect, it } from "vitest";
import {
  createJarvisPoints,
  jarvisOrbitPoints,
  projectJarvisPoint,
} from "./jarvis-geometry";

describe("Jarvis geometry", () => {
  it("uses deterministic bounded unit-sphere points", () => {
    const points = createJarvisPoints();
    expect(points).toEqual(createJarvisPoints());
    expect(points.length).toBeLessThan(1000);
    for (const point of points) {
      expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(1, 10);
    }
  });

  it.each([0, 1, 300, 10000])(
    "keeps all projected details inside the viewport at time %s",
    (seconds) => {
      for (const point of createJarvisPoints()) {
        const projected = projectJarvisPoint(point, seconds, 320);
        expect(
          Number.isFinite(projected.x + projected.y + projected.radius),
        ).toBe(true);
        expect(Math.abs(projected.x) + projected.radius).toBeLessThan(160);
        expect(Math.abs(projected.y) + projected.radius).toBeLessThan(160);
        expect(projected.opacity).toBeGreaterThan(0);
        expect(projected.opacity).toBeLessThanOrEqual(1);
      }
    },
  );

  it("moves continuously and gives the front shell stronger contrast", () => {
    const front = { x: 0.3, y: 0, z: 0.9 };
    const back = { x: 0.3, y: 0, z: -0.9 };
    const first = projectJarvisPoint(front, 1, 500);
    const next = projectJarvisPoint(front, 1 + 1 / 60, 500);
    expect(Math.hypot(first.x - next.x, first.y - next.y)).toBeLessThan(1);
    expect(first.opacity).toBeGreaterThan(
      projectJarvisPoint(back, 1, 500).opacity,
    );
  });

  it("fits incomplete orbits inside the canvas", () => {
    const points = jarvisOrbitPoints(0.7, 40, 500);
    expect(points[0]).not.toEqual(points[points.length - 1]);
    for (const point of points) {
      expect(Math.hypot(point.x, point.y)).toBeLessThan(250);
    }
  });
});
