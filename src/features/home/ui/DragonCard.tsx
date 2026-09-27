import { memo, type ReactNode } from "react";
import { DRAGON_DOTS } from "../model/dragon";
import {
  DRAGON_PADDING,
  DRAGON_PIXEL_SIZE,
  DRAGON_VIEW_HEIGHT,
  DRAGON_VIEW_WIDTH,
} from "../model/dragon-constants";
import { HomeCard } from "./HomeCard";
import { useDragonParticles } from "./use-dragon-particles";

/** Pixel wyvern with a steady silhouette and softly falling square fragments. */
export const DragonCard = memo(function DragonCard(): ReactNode {
  const canvasRef = useDragonParticles();

  return (
    <HomeCard title="MonoCode" className="overflow-hidden">
      <div className="relative h-full w-full overflow-hidden text-accent">
        <svg
          role="img"
          aria-label="Pixel dragon with spread wings and a curled tail"
          viewBox={`0 0 ${DRAGON_VIEW_WIDTH} ${DRAGON_VIEW_HEIGHT}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform={`translate(${DRAGON_PADDING} ${DRAGON_PADDING})`}>
            {DRAGON_DOTS.map((dot) => (
              <rect
                key={`${dot.x}:${dot.y}`}
                x={dot.x + (1 - DRAGON_PIXEL_SIZE) / 2}
                y={dot.y + (1 - DRAGON_PIXEL_SIZE) / 2}
                width={DRAGON_PIXEL_SIZE}
                height={DRAGON_PIXEL_SIZE}
                fill={dot.eye ? "var(--color-content)" : "currentColor"}
                fillOpacity={dot.intensity}
              />
            ))}
          </g>
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>
    </HomeCard>
  );
});
