import type { BrandPalette } from "../brand-visual/types";
import { SPHERE_RING_DOTS } from "./constants";
import {
  depthShade,
  facesSide,
  nodeAngle,
  ringPoint,
  trailStrength,
} from "./geometry";
import type { SphereRing, SphereSide, Vec3 } from "./types";

type RingDot = Vec3 & { angle: number };

const DOT_ANGLES = Array.from(
  { length: SPHERE_RING_DOTS },
  (_, index) => (index / SPHERE_RING_DOTS) * Math.PI * 2,
);

function fillDot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

export function ringDots(
  rings: readonly SphereRing[],
  radius: number,
  seconds: number,
): RingDot[][] {
  return rings.map((ring) =>
    DOT_ANGLES.map((angle) => ({
      ...ringPoint(ring, angle, radius, seconds),
      angle,
    })),
  );
}

export function drawRingDots(
  context: CanvasRenderingContext2D,
  rings: readonly SphereRing[],
  dots: readonly (readonly RingDot[])[],
  radius: number,
  seconds: number,
  palette: BrandPalette,
  side: SphereSide,
): void {
  const base = Math.max(0.6, radius * 0.0085);

  rings.forEach((ring, ringIndex) => {
    for (const dot of dots[ringIndex]) {
      if (!facesSide(dot.z, side)) continue;

      const shade = depthShade(dot.z, radius);
      const trail = trailStrength(ring, dot.angle, seconds);
      const shimmer = 0.9 + Math.sin(seconds * 0.8 + dot.angle * 5) * 0.1;

      context.globalAlpha = (0.1 + shade * 0.5 + trail * 0.4) * shimmer;
      context.fillStyle = trail > 0.35 ? palette.hot : palette.accent;
      fillDot(context, dot.x, dot.y, base * (0.7 + shade * 0.6 + trail * 0.6));
    }
  });
}

export function drawNodes(
  context: CanvasRenderingContext2D,
  rings: readonly SphereRing[],
  radius: number,
  seconds: number,
  palette: BrandPalette,
  side: SphereSide,
): void {
  for (const ring of rings) {
    const point = ringPoint(ring, nodeAngle(ring, seconds), radius, seconds);
    if (!facesSide(point.z, side)) continue;

    const shade = depthShade(point.z, radius);
    const core = radius * 0.032 * (0.75 + shade * 0.5);
    const glow = context.createRadialGradient(
      point.x,
      point.y,
      0,
      point.x,
      point.y,
      core * 3.4,
    );

    glow.addColorStop(0, palette.accent);
    glow.addColorStop(1, "transparent");
    context.globalAlpha = 0.2 + shade * 0.35;
    context.fillStyle = glow;
    fillDot(context, point.x, point.y, core * 3.4);

    context.globalAlpha = 0.45 + shade * 0.5;
    context.fillStyle = palette.hot;
    fillDot(context, point.x, point.y, core);
  }
}
