import { SPHERE_STILL_SECONDS } from "../model/sphere/constants";
import { drawSphereFrame } from "../model/sphere/render";
import type {
  BrandCanvas,
  BrandCanvasOptions,
} from "../model/brand-visual/types";
import { useBrandCanvas } from "./useBrandCanvas";

const SPHERE_CANVAS: BrandCanvasOptions<null> = {
  stillSeconds: SPHERE_STILL_SECONDS,
  readTheme: () => null,
  draw: (context, frame) =>
    drawSphereFrame(context, frame.width, frame.height, frame.seconds),
};

export function useSphereAnimation(): BrandCanvas {
  return useBrandCanvas(SPHERE_CANVAS);
}
