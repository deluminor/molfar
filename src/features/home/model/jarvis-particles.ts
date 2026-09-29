import {
  JARVIS_DUST_INTERVAL,
  JARVIS_DUST_LIFETIME,
  JARVIS_DUST_LIMIT,
} from "./jarvis-constants";
import { projectJarvisPoint } from "./jarvis-geometry";
import type { JarvisPoint, JarvisProjectedPoint } from "./jarvis-types";

const CONTOUR_BUCKETS = 28;
const CONTOUR_RADIUS = 0.36;
const EMITTER_STEP = 7;

function createJarvisDustEmitters(
  points: readonly JarvisPoint[],
  seconds: number,
  size: number,
): JarvisProjectedPoint[] {
  const emitters = new Map<number, JarvisProjectedPoint>();

  for (const point of points) {
    const projected = projectJarvisPoint(point, seconds, size);
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

export function createJarvisDust(
  points: readonly JarvisPoint[],
  seconds: number,
  size: number,
): JarvisProjectedPoint[] {
  if (size <= 0 || seconds <= 0 || points.length === 0) return [];

  const particles: JarvisProjectedPoint[] = [];
  const latestEmission = Math.floor(seconds / JARVIS_DUST_INTERVAL);
  const earliestEmission = Math.max(
    0,
    latestEmission - Math.ceil(JARVIS_DUST_LIFETIME / JARVIS_DUST_INTERVAL),
  );

  for (let event = earliestEmission; event <= latestEmission; event += 1) {
    const born = event * JARVIS_DUST_INTERVAL;
    const age = seconds - born;
    if (age >= JARVIS_DUST_LIFETIME) continue;

    const progress = age / JARVIS_DUST_LIFETIME;
    const emitters = createJarvisDustEmitters(points, born, size);
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

  return particles.slice(-JARVIS_DUST_LIMIT);
}
