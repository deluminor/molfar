import { SPHERE_RADIUS, SPHERE_RING_SCALE, SPHERE_RINGS } from "./constants";
import { drawCore, drawSphereBody } from "./body";
import { createSphereStars } from "./geometry";
import { drawNodes, drawRings } from "./rings";

const STARS = createSphereStars();

function drawStars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  side: number,
  seconds: number,
): void {
  context.fillStyle = "#e0e7ff";

  for (const star of STARS) {
    const twinkle = 0.55 + Math.sin(seconds * star.speed + star.phase) * 0.45;

    context.globalAlpha = star.opacity * twinkle;
    context.beginPath();
    context.arc(
      star.x * width,
      star.y * height,
      Math.max(0.6, star.radius * side),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

export function drawSphereFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seconds: number,
): void {
  const side = Math.min(width, height);
  context.clearRect(0, 0, width, height);
  if (side <= 0) return;

  const radius = side * SPHERE_RADIUS;
  const ringRadius = radius * SPHERE_RING_SCALE;

  context.save();
  context.translate(width / 2, height / 2);
  drawStars(context, width, height, side, seconds);
  drawRings(context, SPHERE_RINGS, ringRadius, seconds, "back");
  drawNodes(context, SPHERE_RINGS, ringRadius, seconds, "back");
  drawSphereBody(context, radius, seconds);
  drawCore(context, radius, seconds);
  drawRings(context, SPHERE_RINGS, ringRadius, seconds, "front");
  drawNodes(context, SPHERE_RINGS, ringRadius, seconds, "front");
  context.restore();
}
