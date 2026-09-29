import {
  JARVIS_CENTER_OFFSET,
  JARVIS_ORBIT_TILTS,
  JARVIS_SURFACE_CURVES,
} from "./jarvis-constants";
import { jarvisOrbitPoints, projectJarvisPoint } from "./jarvis-geometry";
import { createJarvisDust } from "./jarvis-particles";
import type { JarvisPoint } from "./jarvis-types";

export function drawJarvisFrame(
  context: CanvasRenderingContext2D,
  points: JarvisPoint[],
  width: number,
  height: number,
  seconds: number,
  color: string,
  reducedMotion = false,
): void {
  const size = Math.min(width, height);
  context.clearRect(0, 0, width, height);
  if (size <= 0) return;

  context.save();
  context.translate(width / 2, height / 2 - size * JARVIS_CENTER_OFFSET);
  context.fillStyle = color;
  context.strokeStyle = color;

  const coreRadius = size * 0.105 * (1 + Math.sin(seconds * 0.9) * 0.08);
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, coreRadius);

  glow.addColorStop(0, color);
  glow.addColorStop(1, "transparent");
  context.fillStyle = glow;
  context.globalAlpha = 0.25;
  context.beginPath();
  context.arc(0, 0, coreRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = color;
  context.lineWidth = Math.max(0.55, size * 0.0011);
  context.globalAlpha = 0.12;

  for (const curve of JARVIS_SURFACE_CURVES) {
    context.beginPath();
    curve.forEach((point, index) => {
      const projected = projectJarvisPoint(point, seconds, size);

      if (index === 0) context.moveTo(projected.x, projected.y);
      else context.lineTo(projected.x, projected.y);
    });
    context.stroke();
  }

  for (const point of points) {
    const projected = projectJarvisPoint(point, seconds, size);
    context.globalAlpha = projected.opacity;
    context.beginPath();
    context.arc(projected.x, projected.y, projected.radius, 0, Math.PI * 2);
    context.fill();
  }

  context.lineWidth = Math.max(0.7, size * 0.0018);

  for (const tilt of JARVIS_ORBIT_TILTS) {
    const orbit = jarvisOrbitPoints(tilt, seconds, size);
    context.beginPath();

    orbit.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });

    context.globalAlpha = 0.24;
    context.stroke();

    const head = orbit[orbit.length - 1];

    context.globalAlpha = 0.85;
    context.beginPath();
    context.arc(head.x, head.y, Math.max(1.2, size * 0.004), 0, Math.PI * 2);
    context.fill();
  }

  if (!reducedMotion) {
    for (const particle of createJarvisDust(points, seconds, size)) {
      context.globalAlpha = particle.opacity;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.restore();
}
