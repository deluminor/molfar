import type { BrandPalette } from "./types";

export function readBrandPalette(canvas: HTMLCanvasElement): BrandPalette {
  const style = getComputedStyle(canvas);

  return {
    accent: style.color,
    hot: style.getPropertyValue("--color-content").trim() || "#ebebeb",
  };
}
