/** A square in the authored dragon grid. */
export interface DragonDot {
  x: number;
  y: number;
  intensity: number;
  eye: boolean;
}

/** Bottom edge of a filled column, in grid coordinates. */
export interface DragonEmitter {
  x: number;
  y: number;
}

/** A falling square, measured in grid cells and seconds. */
export interface DragonParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  size: number;
}

/** Simulation state, including fractional time until the next emission. */
export interface DragonParticleState {
  particles: DragonParticle[];
  remainder: number;
}

/** Uniform SVG meet transform, shared by the particle overlay. */
export interface DragonTransform {
  scale: number;
  x: number;
  y: number;
}
