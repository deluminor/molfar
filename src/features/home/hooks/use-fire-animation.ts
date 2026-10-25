import { FIRE_STILL_SECONDS } from "../model/fire/constants";
import { drawFireFrame } from "../model/fire/render";
import { readBrandPalette } from "../model/brand-visual/palette";
import type {
  BrandCanvas,
  BrandCanvasOptions,
  BrandPalette,
} from "../model/brand-visual/types";
import { useBrandCanvas } from "./use-brand-canvas";

const FIRE_CANVAS: BrandCanvasOptions<BrandPalette> = {
  stillSeconds: FIRE_STILL_SECONDS,
  readTheme: readBrandPalette,
  draw: (context, frame) =>
    drawFireFrame(
      context,
      frame.width,
      frame.height,
      frame.seconds,
      frame.theme,
    ),
};

export function useFireAnimation(): BrandCanvas {
  return useBrandCanvas(FIRE_CANVAS);
}
