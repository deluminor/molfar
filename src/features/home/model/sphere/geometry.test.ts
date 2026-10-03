import { describe, expect, it } from "vitest";
import {
  SPHERE_PRECESSION_PERIOD,
  SPHERE_RINGS,
  SPHERE_TRAIL_ARC,
} from "./constants";
import {
  depthShade,
  facesSide,
  latitudePoint,
  nodeAngle,
  precessionAngle,
  ringPoint,
  trailStrength,
} from "./geometry";
import type { SphereRing } from "./types";

const length = ({ x, y, z }: { x: number; y: number; z: number }) =>
  Math.hypot(x, y, z);

const forward: SphereRing = {
  inclination: 0,
  tilt: 0,
  nodePhase: 1,
  nodeSpeed: 0.5,
};

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

  it("splits points into back and front passes without overlap", () => {
    expect(facesSide(0, "front")).toBe(true);
    expect(facesSide(0, "back")).toBe(false);
    expect(facesSide(-1, "back")).toBe(true);
  });

  it("shades depth from the far side to the near side", () => {
    expect(depthShade(-100, 100)).toBe(0);
    expect(depthShade(0, 100)).toBeCloseTo(0.5);
    expect(depthShade(100, 100)).toBe(1);
    expect(depthShade(250, 100)).toBe(1);
  });
});

describe("trailStrength", () => {
  it("glows brightest right behind the node and fades along the trail", () => {
    const near = trailStrength(forward, 0.95, 0);
    const far = trailStrength(forward, 1 - SPHERE_TRAIL_ARC * 0.8, 0);

    expect(trailStrength(forward, 1, 0)).toBe(1);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("leaves the arc ahead of the node and past the trail dark", () => {
    expect(trailStrength(forward, 1.2, 0)).toBe(0);
    expect(trailStrength(forward, 1 - SPHERE_TRAIL_ARC - 0.1, 0)).toBe(0);
  });

  it("follows the node backwards on counter-rotating rings", () => {
    const backward = { ...forward, nodeSpeed: -0.5 };

    expect(trailStrength(backward, 1.2, 0)).toBeGreaterThan(0);
    expect(trailStrength(backward, 0.8, 0)).toBe(0);
  });

  it("wraps the trail across the zero angle", () => {
    const atStart = { ...forward, nodePhase: 0.1 };

    expect(trailStrength(atStart, Math.PI * 2 - 0.1, 0)).toBeGreaterThan(0);
  });
});
