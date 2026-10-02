import {
  FIRE_EMBER_PARTICLES,
  FIRE_FLAME_PARTICLES,
  FIRE_TONGUES,
} from "./constants";
import { fireHash } from "./hash";
import type { FireParticle } from "./types";

type Cycle = { progress: number; cycle: number };

function lifeCycle(index: number, seconds: number, lifetime: number): Cycle {
  const time = Math.max(0, seconds) + fireHash(index, 2) * lifetime;
  const cycle = Math.floor(time / lifetime);

  return { progress: time / lifetime - cycle, cycle };
}

function pickTongue(index: number): number {
  let threshold = fireHash(index, 0);

  for (let tongue = 0; tongue < FIRE_TONGUES.length; tongue += 1) {
    threshold -= FIRE_TONGUES[tongue].weight;
    if (threshold <= 0) return tongue;
  }

  return FIRE_TONGUES.length - 1;
}

/** Teardrop envelope: swells just above the base, then narrows into the tip. */
function flameWidth(progress: number): number {
  const swell = Math.sin(Math.PI * Math.min(1, progress * 1.6 + 0.15));

  return (0.55 + 0.9 * swell) * (1 - progress) ** 0.7;
}

function flameParticle(
  index: number,
  seconds: number,
  size: number,
): FireParticle {
  const tongueIndex = pickTongue(index);
  const tongue = FIRE_TONGUES[tongueIndex];
  const { progress, cycle } = lifeCycle(
    index,
    seconds,
    1.3 + fireHash(index, 1) * 1.1,
  );

  const lateral =
    fireHash(index, cycle * 3 + 5) + fireHash(index, cycle * 3 + 6) - 1;
  const reach = tongue.height * (0.82 + 0.26 * fireHash(index, cycle * 3 + 7));
  const sway =
    0.02 *
    progress ** 1.5 *
    Math.sin(seconds * 1.5 + tongueIndex * 1.9 + progress * 2.6);

  return {
    x: size * (tongue.x + lateral * tongue.width * flameWidth(progress) + sway),
    y: -size * reach * progress ** 0.9,
    radius:
      Math.max(0.6, size * 0.0034) *
      (1 - 0.55 * progress) *
      (0.75 + 0.5 * fireHash(index, 4)),
    opacity:
      Math.min(1, progress / 0.06) *
      (1 - progress) ** 1.3 *
      (0.55 + 0.4 * fireHash(index, 9)),
    hot: progress < 0.4 && Math.abs(lateral) < 0.4,
  };
}

function emberParticle(
  index: number,
  seconds: number,
  size: number,
): FireParticle {
  const seed = index + FIRE_FLAME_PARTICLES;
  const { progress, cycle } = lifeCycle(
    seed,
    seconds,
    3.4 + fireHash(seed, 1) * 2.2,
  );
  const origin = (fireHash(seed, cycle + 11) - 0.5) * 0.16;
  const drift = (fireHash(seed, cycle + 12) - 0.5) * 0.18;

  return {
    x:
      size *
      (origin +
        drift * progress +
        0.025 * Math.sin(progress * 4 + index) * progress),
    y: -size * (0.18 + 0.6 * progress ** 0.85),
    radius: Math.max(0.6, size * 0.0026) * (1 - 0.4 * progress),
    opacity: Math.sin(Math.PI * progress) ** 1.2 * 0.7,
    hot: fireHash(seed, cycle + 13) > 0.7,
  };
}

/** Flame and ember dots relative to the flame base; y grows downward like canvas space. */
export function createFireParticles(
  seconds: number,
  size: number,
): FireParticle[] {
  if (size <= 0) return [];

  const flame = Array.from({ length: FIRE_FLAME_PARTICLES }, (_, index) =>
    flameParticle(index, seconds, size),
  );
  const embers = Array.from({ length: FIRE_EMBER_PARTICLES }, (_, index) =>
    emberParticle(index, seconds, size),
  );

  return [...flame, ...embers];
}
