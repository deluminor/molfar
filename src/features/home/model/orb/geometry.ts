import { ORB_POINT_COUNT } from "./constants";
import type { OrbPoint, OrbProjectedPoint } from "./types";

export function createOrbPoints(): OrbPoint[] {
  return Array.from({ length: ORB_POINT_COUNT }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / ORB_POINT_COUNT;
    const radius = Math.sqrt(1 - y * y);
    const angle = index * Math.PI * (3 - Math.sqrt(5));

    return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
  });
}

export function projectOrbPoint(
  point: OrbPoint,
  seconds: number,
  size: number,
): OrbProjectedPoint {
  const angle = seconds * 0.11;
  const x = point.x * Math.cos(angle) + point.z * Math.sin(angle);
  const z = point.z * Math.cos(angle) - point.x * Math.sin(angle);
  const y = point.y * Math.cos(0.24) - z * Math.sin(0.24);

  const depth = point.y * Math.sin(0.24) + z * Math.cos(0.24);
  const perspective = 3.8 / (3.8 - depth);
  const scale = size * 0.32 * (1 + Math.sin(seconds * 0.55) * 0.012);

  return {
    x: x * perspective * scale,
    y: y * perspective * scale,
    radius: Math.max(0.6, size * 0.0023) * (0.7 + perspective * 0.4),
    opacity:
      (0.13 + ((depth + 1) / 2) ** 1.8 * 0.76) *
      (0.94 + Math.sin(seconds * 0.65 + point.y * 3 + point.x * 2) * 0.06),
  };
}

export function orbitPoints(
  tilt: number,
  seconds: number,
  size: number,
): OrbPoint[] {
  return Array.from({ length: 97 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 1.75 + seconds * 0.065 + tilt;
    const x = Math.cos(angle) * size * 0.43;
    const y = Math.sin(angle) * size * 0.16;

    return {
      x: x * Math.cos(tilt) - y * Math.sin(tilt),
      y: x * Math.sin(tilt) + y * Math.cos(tilt),
      z: Math.sin(angle),
    };
  });
}
