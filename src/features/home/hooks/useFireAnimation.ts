import { FIRE_STILL_SECONDS } from "../model/fire/constants";
import { drawFireFrame } from "../model/fire/render";
import type { FirePalette } from "../model/fire/types";
import type {
  BrandCanvas,
  BrandCanvasOptions,
} from "../model/brand-visual/types";
import { useBrandCanvas } from "./useBrandCanvas";

function readPalette(canvas: HTMLCanvasElement): FirePalette {
  const style = getComputedStyle(canvas);

  return {
    accent: style.color,
    hot: style.getPropertyValue("--color-content").trim() || "#ebebeb",
  };
}

const FIRE_CANVAS: BrandCanvasOptions<FirePalette> = {
  stillSeconds: FIRE_STILL_SECONDS,
  readTheme: readPalette,
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
