import { describe, expect, it } from "vitest";
import { SPHERE_PRECESSION_PERIOD, SPHERE_RINGS } from "./constants";
import {
  createSphereStars,
  latitudePoint,
  nodeAngle,
  precessionAngle,
  ringColor,
  ringPoint,
} from "./geometry";

const length = ({ x, y, z }: { x: number; y: number; z: number }) =>
  Math.hypot(x, y, z);

describe("sphere geometry", () => {
  it("keeps every ring point on its shell while the cage precesses", () => {
    for (const ring of SPHERE_RINGS) {
      for (const seconds of [0, 7.5, 31]) {
        for (const angle of [0, 1, 2.5, 4]) {
          expect(length(ringPoint(ring, angle, 100, seconds))).toBeCloseTo(100);
        }
      }
    }
  });

  it("puts each ring partly in front of and partly behind the sphere", () => {
    for (const ring of SPHERE_RINGS) {
      const depths = Array.from(
        { length: 32 },
        (_, index) => ringPoint(ring, (index / 32) * Math.PI * 2, 100, 0).z,
      );

      expect(Math.max(...depths)).toBeGreaterThan(0);
      expect(Math.min(...depths)).toBeLessThan(0);
    }
  });

  it("completes one precession per period", () => {
    expect(precessionAngle(SPHERE_PRECESSION_PERIOD)).toBeCloseTo(Math.PI * 2);
    expect(precessionAngle(0)).toBe(0);
  });

  it("moves agent nodes along their rings over time", () => {
    const [ring] = SPHERE_RINGS;

    expect(nodeAngle(ring, 0)).toBe(ring.nodePhase);
    expect(nodeAngle(ring, 10)).toBeCloseTo(
      ring.nodePhase + ring.nodeSpeed * 10,
    );
  });

  it("keeps latitude points on the sphere surface", () => {
    expect(length(latitudePoint(0.6, 1.2, 50, 3))).toBeCloseTo(50);
  });

  it("colours ring ends violet and the front crossing cyan", () => {
    expect(ringColor(0)).toBe("rgb(124, 58, 237)");
    expect(ringColor(Math.PI / 2)).toBe("rgb(103, 232, 249)");
  });

  it("creates a stable star field inside the card", () => {
    const stars = createSphereStars(12);

    expect(stars).toEqual(createSphereStars(12));
    for (const star of stars) {
      expect(Math.abs(star.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(star.y)).toBeLessThanOrEqual(0.5);
      expect(star.opacity).toBeGreaterThan(0);
    }
  });
});
