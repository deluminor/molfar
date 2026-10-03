import { FIRE_BASE_OFFSET, FIRE_SCALE } from "./constants";
import { createFireLogPoints } from "./logs";
import { createFireParticles } from "./particles";
import type { BrandPalette } from "../brand-visual/types";
import type { FireParticle } from "./types";

function drawDots(
  context: CanvasRenderingContext2D,
  dots: readonly FireParticle[],
  palette: BrandPalette,
): void {
  for (const dot of dots) {
    if (dot.opacity <= 0) continue;

    context.globalAlpha = dot.opacity;
    context.fillStyle = dot.hot ? palette.hot : palette.accent;
    context.beginPath();
    context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    context.fill();
  }
}

export function drawFireFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seconds: number,
  palette: BrandPalette,
): void {
  const side = Math.min(width, height);
  const size = side * FIRE_SCALE;
  context.clearRect(0, 0, width, height);
  if (side <= 0) return;

  context.save();
  context.translate(width / 2, height / 2 + side * FIRE_BASE_OFFSET);

  const glowRadius = size * 0.24 * (1 + Math.sin(seconds * 1.1) * 0.05);
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, glowRadius);

  glow.addColorStop(0, palette.accent);
  glow.addColorStop(1, "transparent");
  context.fillStyle = glow;
  context.globalAlpha = 0.2;
  context.beginPath();
  context.arc(0, 0, glowRadius, 0, Math.PI * 2);
  context.fill();

  drawDots(context, createFireLogPoints(seconds, size), palette);
  drawDots(context, createFireParticles(seconds, size), palette);

  context.restore();
}
