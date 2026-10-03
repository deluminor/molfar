import { expect, it } from "vitest";
import { ORB_DUST_INTERVAL, ORB_DUST_LIMIT } from "./constants";
import { createOrbPoints, projectOrbPoint } from "./geometry";
import { createOrbDust } from "./particles";

it("emits evenly from the projected lower contour without altering it", () => {
  const points = createOrbPoints();
  const original = structuredClone(points);
  const dust = createOrbDust(points, 0.0001, 320);
  expect(dust).toHaveLength(1);
  expect(dust[0].y).toBeGreaterThan(320 * 0.16);
  const source = points
    .map((point) => projectOrbPoint(point, 0, 320))
    .find((projected) => {
      return (
        Math.hypot(projected.x - dust[0].x, projected.y - dust[0].y) < 0.01
      );
    });
  expect(source).toBeDefined();
  expect(dust[0].radius).toBe(source?.radius);
  expect(points).toEqual(original);
});

it("keeps a steady dust cadence while distributing particles across the contour", () => {
  const points = createOrbPoints();
  const dust = createOrbDust(points, 1, 320);
  const xCoordinates = new Set(dust.map((particle) => Math.round(particle.x)));
  expect(dust).toHaveLength(Math.floor(1 / ORB_DUST_INTERVAL) + 1);
  expect(xCoordinates.size).toBeGreaterThan(6);
});

it("falls continuously and fades before recycling", () => {
  const points = createOrbPoints();
  const early = createOrbDust(points, 0.75, 320)[0];
  const late = createOrbDust(points, 3, 320)[0];
  expect(late.y).toBeGreaterThan(early.y);
  expect(late.opacity).toBeLessThan(early.opacity * 0.02);
  expect(early.opacity).toBeGreaterThan(0.25);
  const current = createOrbDust(points, 1, 320)[0];
  const next = createOrbDust(points, 1 + 1 / 60, 320)[0];
  expect(Math.hypot(next.x - current.x, next.y - current.y)).toBeLessThan(1);
});

it("keeps long-running dust deterministic, bounded and below the sphere", () => {
  const points = createOrbPoints();
  for (const seconds of [0, 1, 100, 10000]) {
    const dust = createOrbDust(points, seconds, 320);
    expect(dust).toEqual(createOrbDust(points, seconds, 320));
    expect(dust.length).toBeLessThanOrEqual(ORB_DUST_LIMIT);
    for (const particle of dust) {
      expect(Number.isFinite(particle.x + particle.y + particle.radius)).toBe(
        true,
      );
      expect(particle.opacity).toBeGreaterThanOrEqual(0);
      expect(particle.opacity).toBeLessThan(1);
      expect(particle.y).toBeLessThan(320 * 0.9);
    }
  }
  expect(createOrbDust([], 1, 320)).toEqual([]);
  expect(createOrbDust(points, 1, 0)).toEqual([]);
});
