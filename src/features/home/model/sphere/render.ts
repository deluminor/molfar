import type { BrandPalette } from "../brand-visual/types";
import { drawCore, drawShell, latticeCurves } from "./body";
import { SPHERE_RADIUS, SPHERE_RING_SCALE, SPHERE_RINGS } from "./constants";
import { drawNodes, drawRingDots, ringDots } from "./rings";

export function drawSphereFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seconds: number,
  palette: BrandPalette,
): void {
  const side = Math.min(width, height);
  context.clearRect(0, 0, width, height);
  if (side <= 0) return;

  const radius = side * SPHERE_RADIUS;
  const ringRadius = radius * SPHERE_RING_SCALE;
  const dots = ringDots(SPHERE_RINGS, ringRadius, seconds);
  const lattice = latticeCurves(radius, seconds);

  context.save();
  context.translate(width / 2, height / 2);

  drawRingDots(
    context,
    SPHERE_RINGS,
    dots,
    ringRadius,
    seconds,
    palette,
    "back",
  );
  drawNodes(context, SPHERE_RINGS, ringRadius, seconds, palette, "back");
  drawShell(context, lattice, radius, palette, "back");

  drawCore(context, radius, seconds, palette);

  drawShell(context, lattice, radius, palette, "front");
  drawRingDots(
    context,
    SPHERE_RINGS,
    dots,
    ringRadius,
    seconds,
    palette,
    "front",
  );
  drawNodes(context, SPHERE_RINGS, ringRadius, seconds, palette, "front");

  context.restore();
}
