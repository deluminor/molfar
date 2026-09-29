import { memo, useState, type ReactNode } from "react";
import {
  readBrandVisual,
  saveBrandVisual,
} from "../model/brand-visual-preference";
import type { BrandVisual } from "../model/brand-visual-types";
import { BrandVisualSelector } from "./BrandVisualSelector";
import { DragonVisual } from "./DragonVisual";
import { HomeCard } from "./HomeCard";
import { JarvisVisual } from "./JarvisVisual";

export const DragonCard = memo(function DragonCard(): ReactNode {
  const [visual, setVisual] = useState(readBrandVisual);

  function selectVisual(next: BrandVisual): void {
    setVisual(next);
    saveBrandVisual(next);
  }

  return (
    <HomeCard
      title="MonoCode"
      className="home-brand-card overflow-hidden"
      actions={<BrandVisualSelector value={visual} onChange={selectVisual} />}
    >
      <div
        key={visual}
        className="home-brand-visual relative h-full w-full text-accent"
      >
        {visual === "dragon" ? <DragonVisual /> : <JarvisVisual />}
      </div>
    </HomeCard>
  );
});
