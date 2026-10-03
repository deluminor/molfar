import {
  SPHERE_CAMERA_TILT,
  SPHERE_PRECESSION_PERIOD,
  SPHERE_RING_COLORS,
  SPHERE_STAR_COUNT,
} from "./constants";
import type { SphereRing, SphereStar, Vec3 } from "./types";

function rotateX(point: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
}

function rotateY(point: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

function rotateZ(point: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
    z: point.z,
  };
}

export function precessionAngle(seconds: number): number {
  return (seconds / SPHERE_PRECESSION_PERIOD) * Math.PI * 2;
}

/** Places a model-space point in view space: precession, then the camera tilt. */
export function toView(point: Vec3, seconds: number): Vec3 {
  return rotateX(rotateY(point, precessionAngle(seconds)), SPHERE_CAMERA_TILT);
}

/** A point on a ring of the given radius; positive z faces the viewer. */
export function ringPoint(
  ring: SphereRing,
  angle: number,
  radius: number,
  seconds: number,
): Vec3 {
  const flat = {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: 0,
  };

  return toView(rotateZ(rotateX(flat, ring.inclination), ring.tilt), seconds);
}

export function nodeAngle(ring: SphereRing, seconds: number): number {
  return ring.nodePhase + ring.nodeSpeed * seconds;
}

/** A point on the sphere surface at a latitude (-1..1 of the radius) and longitude angle. */
export function latitudePoint(
  latitude: number,
  angle: number,
  radius: number,
  seconds: number,
): Vec3 {
  const ring = Math.sqrt(1 - latitude * latitude) * radius;

  return toView(
    {
      x: Math.cos(angle) * ring,
      y: latitude * radius,
      z: Math.sin(angle) * ring,
    },
    seconds,
  );
}

export function meridianPoint(
  longitude: number,
  angle: number,
  radius: number,
  seconds: number,
): Vec3 {
  const point = {
    x: Math.sin(angle) * Math.cos(longitude) * radius,
    y: Math.cos(angle) * radius,
    z: Math.sin(angle) * Math.sin(longitude) * radius,
  };

  return toView(point, seconds);
}

/** Ring stroke colour by angle: violet at the far ends, cyan where it crosses the front. */
export function ringColor(angle: number): string {
  const t = Math.abs(Math.sin(angle));
  const { edge, middle, peak } = SPHERE_RING_COLORS;
  const [from, to, local] =
    t < 0.6 ? [edge, middle, t / 0.6] : [middle, peak, (t - 0.6) / 0.4];
  const channel = (index: number) =>
    Math.round(from[index] + (to[index] - from[index]) * local);

  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function hash(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;

  return value - Math.floor(value);
}

/** Deterministic star field in units of the shorter side, centred on the card. */
export function createSphereStars(count = SPHERE_STAR_COUNT): SphereStar[] {
  return Array.from({ length: count }, (_, index) => ({
    x: hash(index + 1) - 0.5,
    y: hash(index + 101) - 0.5,
    radius: 0.0018 + hash(index + 201) * 0.0032,
    opacity: 0.25 + hash(index + 301) * 0.5,
    phase: hash(index + 401) * Math.PI * 2,
    speed: 0.6 + hash(index + 501) * 1.4,
  }));
}
