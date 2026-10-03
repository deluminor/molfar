import { SPHERE_RING_SEGMENTS } from "./constants";
import { nodeAngle, ringColor, ringPoint } from "./geometry";
import type { SphereRing, Vec3 } from "./types";

export type RingSide = "back" | "front";

const SEGMENT_COLORS = Array.from(
  { length: SPHERE_RING_SEGMENTS },
  (_, index) => ringColor(((index + 0.5) / SPHERE_RING_SEGMENTS) * Math.PI * 2),
);

const RUN_LENGTH = 3;

const facing = (z: number, side: RingSide): boolean =>
  side === "front" ? z >= 0 : z < 0;

/** 0 behind the equator of the ring cage, rising smoothly to 1 toward the viewer. */
function frontness(z: number, radius: number): number {
  const t = Math.min(1, Math.max(0, z / (radius * 0.3)));

  return t * t * (3 - 2 * t);
}

function strokeRun(
  context: CanvasRenderingContext2D,
  points: readonly Vec3[],
  from: number,
  to: number,
): void {
  context.beginPath();
  context.moveTo(points[from].x, points[from].y);
  for (let index = from + 1; index <= to; index++)
    context.lineTo(points[index].x, points[index].y);
  context.stroke();
}

export function drawRings(
  context: CanvasRenderingContext2D,
  rings: readonly SphereRing[],
  radius: number,
  seconds: number,
  side: RingSide,
): void {
  const width = radius * 0.04;

  context.lineCap = "butt";
  context.lineJoin = "round";

  for (const ring of rings) {
    const points = Array.from(
      { length: SPHERE_RING_SEGMENTS + 1 },
      (_, index) =>
        ringPoint(
          ring,
          (index / SPHERE_RING_SEGMENTS) * Math.PI * 2,
          radius,
          seconds,
        ),
    );

    // Short runs keep the colour and depth fade smooth with few overlapping joints.
    for (let start = 0; start < SPHERE_RING_SEGMENTS; start += RUN_LENGTH) {
      const end = Math.min(start + RUN_LENGTH, SPHERE_RING_SEGMENTS);
      const z = (points[start].z + points[end].z) / 2;
      if (!facing(z, side)) continue;

      const front = frontness(z, radius);

      context.strokeStyle = SEGMENT_COLORS[Math.floor((start + end) / 2)];
      if (front > 0) {
        context.globalAlpha = 0.16 * front;
        context.lineWidth = width * 3.2;
        strokeRun(context, points, start, end);
      }

      context.globalAlpha = 0.3 + 0.65 * front;
      context.lineWidth = width * (0.6 + 0.4 * front);
      strokeRun(context, points, start, end);
    }
  }
}

export function drawNodes(
  context: CanvasRenderingContext2D,
  rings: readonly SphereRing[],
  radius: number,
  seconds: number,
  side: RingSide,
): void {
  for (const ring of rings) {
    const point = ringPoint(ring, nodeAngle(ring, seconds), radius, seconds);
    if (!facing(point.z, side)) continue;

    const depth = 1 + point.z / (radius * 5);
    const core = radius * 0.075 * depth;
    const dim = side === "back" ? 0.35 : 1;
    const glow = context.createRadialGradient(
      point.x,
      point.y,
      0,
      point.x,
      point.y,
      core * 2.6,
    );

    glow.addColorStop(0, ring.nodeColor);
    glow.addColorStop(1, "transparent");
    context.globalAlpha = 0.65 * dim;
    context.fillStyle = glow;
    context.beginPath();
    context.arc(point.x, point.y, core * 2.6, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = dim;
    context.fillStyle = ring.nodeColor;
    context.beginPath();
    context.arc(point.x, point.y, core, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(point.x, point.y, core * 0.42, 0, Math.PI * 2);
    context.fill();
  }
}
