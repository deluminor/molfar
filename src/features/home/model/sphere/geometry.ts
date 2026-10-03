import {
  SPHERE_CAMERA_TILT,
  SPHERE_PRECESSION_PERIOD,
  SPHERE_TRAIL_ARC,
} from "./constants";
import type { SphereRing, SphereSide, Vec3 } from "./types";

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

export function facesSide(z: number, side: SphereSide): boolean {
  return side === "front" ? z >= 0 : z < 0;
}

/** 0 at the far side of a shell of the given radius, easing to 1 at the near side. */
export function depthShade(z: number, radius: number): number {
  const t = Math.min(1, Math.max(0, (z / radius + 1) / 2));

  return t * t * (3 - 2 * t);
}

/** 1 right behind the node, fading to 0 at the end of its trail; 0 ahead of it. */
export function trailStrength(
  ring: SphereRing,
  angle: number,
  seconds: number,
): number {
  const full = Math.PI * 2;
  const direction = Math.sign(ring.nodeSpeed) || 1;
  const behind =
    ((((nodeAngle(ring, seconds) - angle) * direction) % full) + full) % full;
  if (behind > SPHERE_TRAIL_ARC) return 0;

  return (1 - behind / SPHERE_TRAIL_ARC) ** 2;
}
