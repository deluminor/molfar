import { BRAND_VISUAL_STORAGE_KEY } from "./constants";
import type { BrandVisual } from "./types";

/** Maps stored values, including pre-MOLFAR ones ("dragon", "jarvis"), to a visual. */
export function parseBrandVisual(stored: string | null): BrandVisual {
  if (stored === "orb" || stored === "jarvis") return "orb";

  return "fire";
}

export function readBrandVisual(): BrandVisual {
  try {
    return parseBrandVisual(localStorage.getItem(BRAND_VISUAL_STORAGE_KEY));
  } catch (error) {
    console.error("Failed to read home brand visual preference:", error);
    return "fire";
  }
}

export function saveBrandVisual(visual: BrandVisual): void {
  try {
    localStorage.setItem(BRAND_VISUAL_STORAGE_KEY, visual);
  } catch (error) {
    console.error("Failed to save home brand visual preference:", error);
  }
}
