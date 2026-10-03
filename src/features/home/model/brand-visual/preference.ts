import { BRAND_VISUAL_STORAGE_KEY } from "./constants";
import type { BrandVisual } from "./types";

const DEFAULT_VISUAL: BrandVisual = "sphere";

export function parseBrandVisual(stored: string | null): BrandVisual {
  if (stored === "fire" || stored === "orb" || stored === "sphere")
    return stored;

  return DEFAULT_VISUAL;
}

export function readBrandVisual(): BrandVisual {
  try {
    return parseBrandVisual(localStorage.getItem(BRAND_VISUAL_STORAGE_KEY));
  } catch (error) {
    console.error("Failed to read home brand visual preference:", error);
    return DEFAULT_VISUAL;
  }
}

export function saveBrandVisual(visual: BrandVisual): void {
  try {
    localStorage.setItem(BRAND_VISUAL_STORAGE_KEY, visual);
  } catch (error) {
    console.error("Failed to save home brand visual preference:", error);
  }
}
