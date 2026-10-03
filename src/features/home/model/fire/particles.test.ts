import { describe, expect, it } from "vitest";
import { FIRE_EMBER_PARTICLES, FIRE_FLAME_PARTICLES } from "./constants";
import { createFireLogPoints } from "./logs";
import { createFireParticles } from "./particles";

const SIZE = 320;

describe("createFireParticles", () => {
  it("is a deterministic function of time", () => {
    expect(createFireParticles(4.2, SIZE)).toEqual(
      createFireParticles(4.2, SIZE),
    );
    expect(createFireParticles(4.2, SIZE)).not.toEqual(
      createFireParticles(4.3, SIZE),
    );
  });

  it.each([0, 1, 300, 100_000])(
    "keeps every dot finite, above the base and inside the card at %s s",
    (seconds) => {
      const particles = createFireParticles(seconds, SIZE);

      expect(particles).toHaveLength(
        FIRE_FLAME_PARTICLES + FIRE_EMBER_PARTICLES,
      );
      for (const particle of particles) {
        expect(Number.isFinite(particle.x + particle.y + particle.radius)).toBe(
          true,
        );
        expect(particle.y).toBeLessThanOrEqual(0);
        expect(particle.y).toBeGreaterThan(-SIZE * 0.8);
        expect(Math.abs(particle.x)).toBeLessThan(SIZE / 2);
        expect(particle.opacity).toBeGreaterThanOrEqual(0);
        expect(particle.opacity).toBeLessThanOrEqual(1);
      }
    },
  );

  it("keeps the hot core low and narrows toward the tips", () => {
    const flame = Array.from({ length: 20 }, (_, step) =>
      createFireParticles(step * 0.37, SIZE).slice(0, FIRE_FLAME_PARTICLES),
    ).flat();
    const hot = flame.filter((particle) => particle.hot);
    const spread = (band: typeof flame) =>
      Math.max(...band.map((particle) => Math.abs(particle.x)));

    expect(hot.length).toBeGreaterThan(0);
    expect(Math.min(...hot.map((particle) => particle.y))).toBeGreaterThan(
      -SIZE * 0.25,
    );
    expect(
      spread(flame.filter((particle) => particle.y < -SIZE * 0.3)),
    ).toBeLessThan(
      spread(flame.filter((particle) => particle.y > -SIZE * 0.08)),
    );
  });

  it("renders nothing for an empty canvas", () => {
    expect(createFireParticles(1, 0)).toEqual([]);
  });
});

describe("createFireLogPoints", () => {
  it("draws two dotted logs that smoulder only under the flame", () => {
    const points = createFireLogPoints(1, SIZE);
    const hot = points.filter((point) => point.hot);

    expect(points.length).toBeGreaterThan(100);
    expect(hot.length).toBeGreaterThan(0);
    for (const point of hot)
      expect(Math.abs(point.x)).toBeLessThan(SIZE * 0.13);
    for (const point of points) {
      expect(point.opacity).toBeGreaterThanOrEqual(0);
      expect(point.opacity).toBeLessThanOrEqual(1);
    }
    expect(createFireLogPoints(1, 0)).toEqual([]);
  });
});
