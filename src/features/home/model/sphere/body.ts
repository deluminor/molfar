import type { BrandPalette } from "../brand-visual/types";
import { SPHERE_LATTICE_SEGMENTS } from "./constants";
import { facesSide, latitudePoint, meridianPoint } from "./geometry";
import type { SphereSide, Vec3 } from "./types";

const LATITUDES = [-0.6, 0, 0.6];
const LONGITUDES = [0, Math.PI / 3, (Math.PI * 2) / 3];
const LATTICE_STEPS = Array.from(
  { length: SPHERE_LATTICE_SEGMENTS + 1 },
  (_, index) => (index / SPHERE_LATTICE_SEGMENTS) * Math.PI * 2,
);

export function latticeCurves(radius: number, seconds: number): Vec3[][] {
  return [
    ...LATITUDES.map((latitude) =>
      LATTICE_STEPS.map((angle) =>
        latitudePoint(latitude, angle, radius, seconds),
      ),
    ),
    ...LONGITUDES.map((longitude) =>
      LATTICE_STEPS.map((angle) =>
        meridianPoint(longitude, angle, radius, seconds),
      ),
    ),
  ];
}

function traceSide(
  context: CanvasRenderingContext2D,
  curves: readonly (readonly Vec3[])[],
  side: SphereSide,
): void {
  context.beginPath();

  for (const points of curves) {
    for (let index = 0; index < points.length - 1; index++) {
      const from = points[index];
      const to = points[index + 1];
      if (!facesSide((from.z + to.z) / 2, side)) continue;

      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    }
  }
}

function fillGlow(
  context: CanvasRenderingContext2D,
  radius: number,
  color: string,
  alpha: number,
): void {
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, radius);

  glow.addColorStop(0, color);
  glow.addColorStop(1, "transparent");
  context.globalAlpha = alpha;
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
}

/** Glass shell: a hairline lattice per side, plus the rim on the front pass. */
export function drawShell(
  context: CanvasRenderingContext2D,
  curves: readonly (readonly Vec3[])[],
  radius: number,
  palette: BrandPalette,
  side: SphereSide,
): void {
  context.strokeStyle = palette.accent;
  context.lineWidth = Math.max(0.55, radius * 0.0045);
  context.globalAlpha = side === "front" ? 0.14 : 0.05;
  traceSide(context, curves, side);
  context.stroke();

  if (side === "back") return;

  context.globalAlpha = 0.22;
  context.lineWidth = Math.max(0.7, radius * 0.007);
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();
}

function starPath(
  context: CanvasRenderingContext2D,
  size: number,
  waist: number,
): void {
  context.beginPath();
  context.moveTo(0, -size);
  context.quadraticCurveTo(waist, -waist, size, 0);
  context.quadraticCurveTo(waist, waist, 0, size);
  context.quadraticCurveTo(-waist, waist, -size, 0);
  context.quadraticCurveTo(-waist, -waist, 0, -size);
  context.closePath();
}

/** The logo's guiding star: a four-point spark over a breathing accent glow. */
export function drawCore(
  context: CanvasRenderingContext2D,
  radius: number,
  seconds: number,
  palette: BrandPalette,
): void {
  const breath = 1 + Math.sin(seconds * 1.1) * 0.06;

  fillGlow(context, radius * 0.95 * breath, palette.accent, 0.26);
  fillGlow(context, radius * 0.42 * breath, palette.hot, 0.18);

  context.save();
  context.rotate(Math.sin(seconds * 0.35) * 0.12);
  context.globalAlpha = 0.88;
  context.fillStyle = palette.hot;
  starPath(context, radius * 0.22 * breath, radius * 0.022);
  context.fill();

  context.globalAlpha = 0.85;
  context.fillStyle = palette.accent;
  starPath(context, radius * 0.07, radius * 0.01);
  context.fill();
  context.restore();
}
