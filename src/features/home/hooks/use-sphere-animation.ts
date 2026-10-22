import { SPHERE_STILL_SECONDS } from "../model/sphere/constants";
import { drawSphereFrame } from "../model/sphere/render";
import { readBrandPalette } from "../model/brand-visual/palette";
import type {
  BrandCanvas,
  BrandCanvasOptions,
  BrandPalette,
} from "../model/brand-visual/types";
import { useBrandCanvas } from "./use-brand-canvas";

const SPHERE_CANVAS: BrandCanvasOptions<BrandPalette> = {
  stillSeconds: SPHERE_STILL_SECONDS,
  readTheme: readBrandPalette,
  draw: (context, frame) =>
    drawSphereFrame(
      context,
      frame.width,
      frame.height,
      frame.seconds,
      frame.theme,
    ),
};

export function useSphereAnimation(): BrandCanvas {
  return useBrandCanvas(SPHERE_CANVAS);
}
