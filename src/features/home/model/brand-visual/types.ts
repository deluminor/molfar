export type BrandVisual = "fire" | "orb";

export interface BrandVisualSelectorProps {
  value: BrandVisual;
  onChange: (value: BrandVisual) => void;
}
