import type { SphereRing } from "./types";

const DEG = Math.PI / 180;

/** A representative moment shown when motion is reduced. */
export const SPHERE_STILL_SECONDS = 7.5;

/** Sphere radius relative to the shorter canvas side. */
export const SPHERE_RADIUS = 0.27;

/** Ring shell radius relative to the sphere radius. */
export const SPHERE_RING_SCALE = 1.16;

/** Seconds for one full precession of the ring cage. */
export const SPHERE_PRECESSION_PERIOD = 48;

/** Fixed downward camera tilt, in radians. */
export const SPHERE_CAMERA_TILT = -0.2;

export const SPHERE_RING_SEGMENTS = 144;

export const SPHERE_LATTICE_SEGMENTS = 72;

export const SPHERE_STAR_COUNT = 42;

export const SPHERE_RINGS: readonly SphereRing[] = [
  {
    inclination: 74 * DEG,
    tilt: -24 * DEG,
    nodePhase: 150 * DEG,
    nodeSpeed: 0.34,
    nodeColor: "#67e8f9",
  },
  {
    inclination: 66 * DEG,
    tilt: 36 * DEG,
    nodePhase: 28 * DEG,
    nodeSpeed: -0.26,
    nodeColor: "#f0abfc",
  },
  {
    inclination: 70 * DEG,
    tilt: 96 * DEG,
    nodePhase: 118 * DEG,
    nodeSpeed: 0.21,
    nodeColor: "#fde68a",
  },
];

export const SPHERE_RING_COLORS = {
  edge: [124, 58, 237],
  middle: [167, 139, 250],
  peak: [103, 232, 249],
} as const;

export const SPHERE_NEBULA = [
  [0, "#ffe7b0"],
  [0.12, "#f6a85c"],
  [0.3, "#c0399f"],
  [0.56, "#6d28d9"],
  [0.8, "#2e1f86"],
  [1, "#18114d"],
] as const;
