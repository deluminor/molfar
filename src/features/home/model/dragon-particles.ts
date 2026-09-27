import {
  DRAGON_PARTICLE_GRAVITY,
  DRAGON_PARTICLE_INTERVAL,
  DRAGON_PARTICLE_LIMIT,
  DRAGON_PIXEL_SIZE,
} from "./dragon-constants";
import type {
  DragonEmitter,
  DragonParticle,
  DragonParticleState,
} from "./dragon-types";

/** Emit a square directly below a silhouette cell, with a gentle lateral drift. */
export function spawnDragonParticle(
  emitter: DragonEmitter,
  random: () => number = Math.random,
): DragonParticle {
  return {
    x: emitter.x + 0.5,
    y: emitter.y + 1 + DRAGON_PIXEL_SIZE / 2,
    vx: (random() - 0.5) * 1.4,
    vy: 2.5 + random() * 2,
    age: 0,
    lifetime: 2.8 + random() * 1.4,
    size: DRAGON_PIXEL_SIZE * (0.75 + random() * 0.25),
  };
}

/** Analytic acceleration keeps trajectories consistent across frame rates. */
export function advanceDragonParticle(
  particle: DragonParticle,
  seconds: number,
): DragonParticle {
  const dt = Math.max(0, seconds);
  return {
    ...particle,
    x: particle.x + particle.vx * dt,
    y: particle.y + particle.vy * dt + 0.5 * DRAGON_PARTICLE_GRAVITY * dt * dt,
    vy: particle.vy + DRAGON_PARTICLE_GRAVITY * dt,
    age: particle.age + dt,
  };
}

/** Fade gently at first, then dissolve before the end of the fall. */
export function dragonParticleOpacity(particle: DragonParticle): number {
  const progress = Math.min(1, Math.max(0, particle.age / particle.lifetime));
  return 0.76 * (1 - progress * progress * (3 - 2 * progress));
}

/** Bounded emission and time-based motion; a suspended frame cannot create a burst. */
export function advanceDragonParticles(
  state: DragonParticleState,
  seconds: number,
  emitters: readonly DragonEmitter[],
  random: () => number = Math.random,
): DragonParticleState {
  const dt = Math.min(0.05, Math.max(0, seconds));
  const particles = state.particles
    .map((particle) => advanceDragonParticle(particle, dt))
    .filter((particle) => particle.age < particle.lifetime);
  let remainder = state.remainder + dt;
  while (remainder >= DRAGON_PARTICLE_INTERVAL) {
    remainder -= DRAGON_PARTICLE_INTERVAL;
    if (particles.length >= DRAGON_PARTICLE_LIMIT || emitters.length === 0)
      continue;
    const emitter = emitters[Math.floor(random() * emitters.length)];
    particles.push(
      advanceDragonParticle(spawnDragonParticle(emitter, random), remainder),
    );
  }
  return { particles, remainder };
}
