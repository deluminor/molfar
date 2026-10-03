import { memo, useState, type ReactNode } from "react";
import {
  readBrandVisual,
  saveBrandVisual,
} from "../model/brand-visual/preference";
import type { BrandVisual } from "../model/brand-visual/types";
import { BrandVisualSelector } from "./BrandVisualSelector";
import { FireVisual } from "./FireVisual";
import { HomeCard } from "./HomeCard";
import { OrbVisual } from "./OrbVisual";

export const BrandCard = memo(function BrandCard(): ReactNode {
  const [visual, setVisual] = useState(readBrandVisual);

  function selectVisual(next: BrandVisual): void {
    setVisual(next);
    saveBrandVisual(next);
  }

  return (
    <HomeCard
      title="MOLFAR"
      className="home-brand-card overflow-hidden"
      actions={<BrandVisualSelector value={visual} onChange={selectVisual} />}
    >
      <div
        key={visual}
        className="home-brand-visual relative h-full w-full text-accent"
      >
        {visual === "fire" ? <FireVisual /> : <OrbVisual />}
      </div>
    </HomeCard>
  );
});
