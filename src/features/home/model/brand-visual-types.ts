export type BrandVisual = "dragon" | "jarvis";

export interface BrandVisualSelectorProps {
  value: BrandVisual;
  onChange: (value: BrandVisual) => void;
}
