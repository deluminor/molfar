import { describe, expect, it } from "vitest";
import {
  advanceDragonParticle,
  advanceDragonParticles,
  dragonParticleOpacity,
  spawnDragonParticle,
} from "./dragon-particles";
import {
  DRAGON_PARTICLE_INTERVAL,
  DRAGON_PARTICLE_LIMIT,
} from "./dragon-constants";
import type { DragonParticleState } from "./dragon-types";

const emitter = { x: 12, y: 24 };
const random = (): number => 0.5;

describe("dragon particle motion", () => {
  it("starts directly below a silhouette cell with a positive downward velocity", () => {
    const particle = spawnDragonParticle(emitter, random);
    expect(particle.x).toBe(emitter.x + 0.5);
    expect(particle.y - particle.size / 2).toBeGreaterThanOrEqual(
      emitter.y + 1,
    );
    expect(particle.vy).toBeGreaterThan(0);
    expect(particle.size).toBeGreaterThan(0);
    expect(particle.age).toBe(0);
  });

  it.each([30, 60, 120])("keeps the same trajectory at %i FPS", (fps) => {
    const initial = spawnDragonParticle(emitter, () => 0.75);
    let stepped = initial;
    for (let frame = 0; frame < fps * 2; frame++) {
      stepped = advanceDragonParticle(stepped, 1 / fps);
    }
    const expected = advanceDragonParticle(initial, 2);
    expect(stepped.x).toBeCloseTo(expected.x, 8);
    expect(stepped.y).toBeCloseTo(expected.y, 8);
    expect(stepped.vy).toBeCloseTo(expected.vy, 8);
    expect(stepped.age).toBeCloseTo(expected.age, 8);
  });

  it("fades monotonically to zero without changing square size", () => {
    const particle = spawnDragonParticle(emitter, random);
    let previousOpacity = 1;
    for (let step = 0; step <= 10; step++) {
      const next = advanceDragonParticle(
        particle,
        (particle.lifetime * step) / 10,
      );
      const opacity = dragonParticleOpacity(next);
      expect(opacity).toBeLessThanOrEqual(previousOpacity);
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(next.size).toBe(particle.size);
      previousOpacity = opacity;
    }
    expect(previousOpacity).toBe(0);
  });

  it("expires particles after their lifetime", () => {
    const particle = spawnDragonParticle(emitter, random);
    const state = {
      particles: [{ ...particle, age: particle.lifetime - 0.01 }],
      remainder: 0,
    };
    expect(advanceDragonParticles(state, 0.02, [], random).particles).toEqual(
      [],
    );
  });

  it("emits at a steady cadence across frame rates", () => {
    const counts = [30, 60, 120].map((fps) => {
      let state: DragonParticleState = { particles: [], remainder: 0 };
      for (let frame = 0; frame < fps; frame++) {
        state = advanceDragonParticles(state, 1 / fps, [emitter], random);
      }
      return state.particles.length;
    });
    expect(counts).toEqual([8, 8, 8]);
  });

  it("caps active particles and discards emission backlog", () => {
    const particle = spawnDragonParticle(emitter, random);
    const state = {
      particles: Array.from({ length: DRAGON_PARTICLE_LIMIT }, () => particle),
      remainder: DRAGON_PARTICLE_INTERVAL,
    };
    const next = advanceDragonParticles(state, 0.05, [emitter], random);
    expect(next.particles).toHaveLength(DRAGON_PARTICLE_LIMIT);
    expect(next.remainder).toBeLessThan(DRAGON_PARTICLE_INTERVAL);
  });

  it("does not burst after a long pause or emit from an empty silhouette", () => {
    const initial = { particles: [], remainder: 0 };
    expect(
      advanceDragonParticles(initial, 60, [emitter], random).particles,
    ).toEqual([]);
    expect(
      advanceDragonParticles({ ...initial, remainder: 1 }, 0.05, [], random)
        .particles,
    ).toEqual([]);
    expect(advanceDragonParticles(initial, -1, [emitter], random)).toEqual(
      initial,
    );
  });
});
