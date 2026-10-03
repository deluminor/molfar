import { SPHERE_LATTICE_SEGMENTS, SPHERE_NEBULA } from "./constants";
import { latitudePoint, meridianPoint } from "./geometry";
import type { Vec3 } from "./types";

const LATITUDES = [-0.6, -0.2, 0.2, 0.6];
const LONGITUDES = [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4];

function strokeCurve(context: CanvasRenderingContext2D, points: Vec3[]): void {
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];

    context.globalAlpha = (from.z + to.z) / 2 >= 0 ? 0.13 : 0.05;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
}

function drawLattice(
  context: CanvasRenderingContext2D,
  radius: number,
  seconds: number,
): void {
  const steps = Array.from(
    { length: SPHERE_LATTICE_SEGMENTS + 1 },
    (_, index) => (index / SPHERE_LATTICE_SEGMENTS) * Math.PI * 2,
  );

  context.strokeStyle = "#e9d5ff";
  context.lineWidth = Math.max(0.5, radius * 0.008);

  for (const latitude of LATITUDES) {
    strokeCurve(
      context,
      steps.map((angle) => latitudePoint(latitude, angle, radius, seconds)),
    );
  }

  for (const longitude of LONGITUDES) {
    strokeCurve(
      context,
      steps.map((angle) => meridianPoint(longitude, angle, radius, seconds)),
    );
  }
}

function fillCircle(
  context: CanvasRenderingContext2D,
  radius: number,
  style: CanvasGradient | string,
  alpha: number,
): void {
  context.globalAlpha = alpha;
  context.fillStyle = style;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
}

export function drawSphereBody(
  context: CanvasRenderingContext2D,
  radius: number,
  seconds: number,
): void {
  const halo = context.createRadialGradient(
    0,
    0,
    radius * 0.8,
    0,
    0,
    radius * 1.7,
  );

  halo.addColorStop(0, "rgba(139, 92, 246, 0.55)");
  halo.addColorStop(1, "rgba(139, 92, 246, 0)");
  fillCircle(context, radius * 1.7, halo, 1);

  const pulse = 1 + Math.sin(seconds * 0.8) * 0.04;
  const nebula = context.createRadialGradient(
    0,
    radius * 0.04,
    0,
    0,
    radius * 0.04,
    radius * pulse,
  );

  for (const [offset, color] of SPHERE_NEBULA)
    nebula.addColorStop(offset, color);
  fillCircle(context, radius, nebula, 1);

  drawLattice(context, radius, seconds);

  const shade = context.createRadialGradient(
    -radius * 0.36,
    -radius * 0.44,
    0,
    -radius * 0.36,
    -radius * 0.44,
    radius * 1.6,
  );

  shade.addColorStop(0.5, "rgba(5, 4, 15, 0)");
  shade.addColorStop(1, "rgba(5, 4, 15, 0.5)");
  fillCircle(context, radius, shade, 1);

  const rim = context.createLinearGradient(-radius, -radius, radius, radius);

  rim.addColorStop(0, "rgba(165, 243, 252, 0.95)");
  rim.addColorStop(0.5, "rgba(139, 92, 246, 0.35)");
  rim.addColorStop(1, "rgba(240, 171, 252, 0.8)");
  context.strokeStyle = rim;
  context.lineWidth = Math.max(0.8, radius * 0.014);
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();
}

function sparklePath(
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

function rhombusPath(context: CanvasRenderingContext2D, size: number): void {
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(size * 0.78, 0);
  context.lineTo(0, size);
  context.lineTo(-size * 0.78, 0);
  context.closePath();
}

export function drawCore(
  context: CanvasRenderingContext2D,
  radius: number,
  seconds: number,
): void {
  const breath = 1 + Math.sin(seconds * 1.3) * 0.06;
  const glow = context.createRadialGradient(
    0,
    0,
    0,
    0,
    0,
    radius * 0.6 * breath,
  );

  glow.addColorStop(0, "rgba(253, 230, 138, 0.85)");
  glow.addColorStop(0.4, "rgba(245, 158, 11, 0.35)");
  glow.addColorStop(1, "rgba(245, 158, 11, 0)");
  fillCircle(context, radius * 0.6 * breath, glow, 1);

  context.save();
  context.rotate(Math.sin(seconds * 0.35) * 0.12);
  context.globalAlpha = 0.95;
  context.fillStyle = "#fffaf0";
  sparklePath(context, radius * 0.41 * breath, radius * 0.036);
  context.fill();

  const gold = context.createLinearGradient(
    0,
    -radius * 0.16,
    0,
    radius * 0.16,
  );

  gold.addColorStop(0, "#fff4c2");
  gold.addColorStop(0.45, "#fcd34d");
  gold.addColorStop(1, "#f59e0b");
  context.globalAlpha = 1;
  context.fillStyle = gold;
  rhombusPath(context, radius * 0.16);
  context.fill();

  context.globalAlpha = 0.55;
  context.fillStyle = "#7c2d12";
  rhombusPath(context, radius * 0.07);
  context.fill();
  context.restore();
}
