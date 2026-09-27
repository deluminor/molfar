import { DRAGON_ROWS } from "./dragon-art";
import {
  DRAGON_PADDING,
  DRAGON_TONES,
  DRAGON_VIEW_HEIGHT,
  DRAGON_VIEW_WIDTH,
} from "./dragon-constants";
import type { DragonDot, DragonEmitter, DragonTransform } from "./dragon-types";

function buildDragonDots(): DragonDot[] {
  const dots: DragonDot[] = [];
  DRAGON_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const intensity = DRAGON_TONES.get(row[x]);
      if (intensity === undefined) continue;
      dots.push({
        x,
        y,
        intensity,
        eye: row[x] === "e",
      });
    }
  });
  return dots;
}

/** Authored silhouette, decoded once — shared by SVG and particle emitters. */
export const DRAGON_DOTS: readonly DragonDot[] = buildDragonDots();

/** Decode the authored pixel art without per-render randomness. */
export function dragonDots(): readonly DragonDot[] {
  return DRAGON_DOTS;
}

/** Bottom-most filled cell per column, so drops never start inside the body. */
export function dragonEmitters(
  dots: readonly DragonDot[] = DRAGON_DOTS,
): DragonEmitter[] {
  const lowest = new Map<number, number>();
  for (const dot of dots) {
    const previous = lowest.get(dot.x);
    if (previous === undefined || dot.y > previous) lowest.set(dot.x, dot.y);
  }
  return [...lowest.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => a.x - b.x);
}

/** Match SVG xMidYMid meet, including authored padding and falling-pixel space. */
export function dragonTransform(
  width: number,
  height: number,
): DragonTransform {
  const scale = Math.max(
    0,
    Math.min(width / DRAGON_VIEW_WIDTH, height / DRAGON_VIEW_HEIGHT),
  );
  return {
    scale,
    x: (width - DRAGON_VIEW_WIDTH * scale) / 2 + DRAGON_PADDING * scale,
    y: (height - DRAGON_VIEW_HEIGHT * scale) / 2 + DRAGON_PADDING * scale,
  };
}
