import {
  ORB_DUST_INTERVAL,
  ORB_DUST_LIFETIME,
  ORB_DUST_LIMIT,
} from "./constants";
import { projectOrbPoint } from "./geometry";
import type { OrbPoint, OrbProjectedPoint } from "./types";

const CONTOUR_BUCKETS = 28;
const CONTOUR_RADIUS = 0.36;
const EMITTER_STEP = 7;

function createOrbDustEmitters(
  points: readonly OrbPoint[],
  seconds: number,
  size: number,
): OrbProjectedPoint[] {
  const emitters = new Map<number, OrbProjectedPoint>();

  for (const point of points) {
    const projected = projectOrbPoint(point, seconds, size);
    if (projected.opacity <= 0.35 || projected.y < size * 0.16) continue;

    const normalizedX = (projected.x / (size * CONTOUR_RADIUS) + 1) / 2;
    const bucket = Math.floor(normalizedX * CONTOUR_BUCKETS);
    if (bucket < 0 || bucket >= CONTOUR_BUCKETS) continue;

    const previous = emitters.get(bucket);
    if (previous === undefined || projected.y > previous.y) {
      emitters.set(bucket, projected);
    }
  }

  return [...emitters.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
}

export function createOrbDust(
  points: readonly OrbPoint[],
  seconds: number,
  size: number,
): OrbProjectedPoint[] {
  if (size <= 0 || seconds <= 0 || points.length === 0) return [];

  const particles: OrbProjectedPoint[] = [];
  const latestEmission = Math.floor(seconds / ORB_DUST_INTERVAL);
  const earliestEmission = Math.max(
    0,
    latestEmission - Math.ceil(ORB_DUST_LIFETIME / ORB_DUST_INTERVAL),
  );

  for (let event = earliestEmission; event <= latestEmission; event += 1) {
    const born = event * ORB_DUST_INTERVAL;
    const age = seconds - born;
    if (age >= ORB_DUST_LIFETIME) continue;

    const progress = age / ORB_DUST_LIFETIME;
    const emitters = createOrbDustEmitters(points, born, size);
    if (emitters.length === 0) continue;

    const source = emitters[(event * EMITTER_STEP) % emitters.length];
    const direction = Math.sin(event * 1.7);

    particles.push({
      x:
        source.x +
        size * (direction * 0.012 * age + Math.sin(age * 1.1) * 0.003),
      y: source.y + size * (0.052 * age + 0.03 * age * age),
      radius: source.radius,
      opacity:
        source.opacity * 0.82 * (1 - progress * progress * (3 - 2 * progress)),
    });
  }

  return particles.slice(-ORB_DUST_LIMIT);
}
