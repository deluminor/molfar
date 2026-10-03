import { FIRE_LOGS } from "./constants";
import type { FireParticle } from "./types";

const LOG_ROWS = [-1, 0, 1];
const LOG_THICKNESS = 0.012;
const LOG_SPACING = 0.011;

/** Dotted crossed logs; the dots under the flame smoulder in the hot color. */
export function createFireLogPoints(
  seconds: number,
  size: number,
): FireParticle[] {
  if (size <= 0) return [];

  const points: FireParticle[] = [];

  FIRE_LOGS.forEach((log, logIndex) => {
    const dx = log.to.x - log.from.x;
    const dy = log.to.y - log.from.y;
    const length = Math.hypot(dx, dy);
    const steps = Math.round(length / LOG_SPACING);
    const normalX = -dy / length;
    const normalY = dx / length;

    for (let step = 0; step <= steps; step += 1) {
      const along = step / steps;
      const x = log.from.x + dx * along;
      const y = log.from.y + dy * along;
      const edgeFade = Math.min(1, Math.min(along, 1 - along) * 8);
      const heat = Math.max(0, 1 - Math.abs(x) / 0.12);
      const flicker =
        0.5 + 0.5 * Math.sin(seconds * 3.1 + step * 1.7 + logIndex);

      for (const row of LOG_ROWS) {
        const offset = row * LOG_THICKNESS;

        points.push({
          x: size * (x + normalX * offset),
          y: size * (y + normalY * offset),
          radius: Math.max(0.6, size * 0.0024),
          opacity: Math.min(
            1,
            edgeFade * (row === 0 ? 0.32 : 0.18) + heat * flicker * 0.45,
          ),
          hot: heat * flicker > 0.55,
        });
      }
    }
  });

  return points;
}
