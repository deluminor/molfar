import type { ReactNode } from "react";
import type {
  BrandVisual,
  BrandVisualSelectorProps,
} from "../model/brand-visual/types";

const NEXT_VISUAL: Record<BrandVisual, BrandVisual> = {
  fire: "orb",
  orb: "fire",
};

const VISUAL_NAME: Record<BrandVisual, string> = {
  fire: "Fire",
  orb: "Orb",
};

export function BrandVisualSelector({
  value,
  onChange,
}: BrandVisualSelectorProps): ReactNode {
  const nextVisual = NEXT_VISUAL[value];
  const label = `${value}: switch to ${VISUAL_NAME[nextVisual]}`;

  function cycleVisual(): void {
    onChange(nextVisual);
  }

  return (
    <button
      type="button"
      className="home-brand-selector"
      aria-label={label}
      title={label}
      onClick={cycleVisual}
    >
      <span aria-hidden="true">←</span>
      <span>{value}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
