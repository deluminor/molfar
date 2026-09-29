import type { ReactNode } from "react";
import type { BrandVisualSelectorProps } from "../model/brand-visual-types";

export function BrandVisualSelector({
  value,
  onChange,
}: BrandVisualSelectorProps): ReactNode {
  const nextVisual = value === "dragon" ? "jarvis" : "dragon";
  const label =
    value === "dragon"
      ? "dragon: switch to Jarvis"
      : "jarvis: switch to Dragon";

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
