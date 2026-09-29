import { BRAND_VISUAL_STORAGE_KEY } from "./brand-visual-constants";
import type { BrandVisual } from "./brand-visual-types";

export function readBrandVisual(): BrandVisual {
  try {
    if (localStorage.getItem(BRAND_VISUAL_STORAGE_KEY) === "jarvis")
      return "jarvis";
  } catch (error) {
    console.error("Failed to read home brand visual preference:", error);
  }

  return "dragon";
}

export function saveBrandVisual(visual: BrandVisual): void {
  try {
    localStorage.setItem(BRAND_VISUAL_STORAGE_KEY, visual);
  } catch (error) {
    console.error("Failed to save home brand visual preference:", error);
  }
}
