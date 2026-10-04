import type { SphereRing } from "./types";

const DEG = Math.PI / 180;

/** A representative moment shown when motion is reduced. */
export const SPHERE_STILL_SECONDS = 7.5;

/** Sphere radius relative to the shorter canvas side. */
export const SPHERE_RADIUS = 0.25;

/** Ring shell radius relative to the sphere radius. */
export const SPHERE_RING_SCALE = 1.3;

/** Seconds for one full precession of the ring cage. */
export const SPHERE_PRECESSION_PERIOD = 48;

/** Fixed downward camera tilt, in radians. */
export const SPHERE_CAMERA_TILT = -0.2;

export const SPHERE_RING_DOTS = 132;

export const SPHERE_LATTICE_SEGMENTS = 72;

/** Arc behind each agent node, in radians, that glows as its trail. */
export const SPHERE_TRAIL_ARC = 1.15;

export const SPHERE_RINGS: readonly SphereRing[] = [
  {
    inclination: 74 * DEG,
    tilt: -24 * DEG,
    nodePhase: 150 * DEG,
    nodeSpeed: 0.34,
  },
  {
    inclination: 66 * DEG,
    tilt: 36 * DEG,
    nodePhase: 28 * DEG,
    nodeSpeed: -0.26,
  },
  {
    inclination: 70 * DEG,
    tilt: 96 * DEG,
    nodePhase: 118 * DEG,
    nodeSpeed: 0.21,
  },
];
