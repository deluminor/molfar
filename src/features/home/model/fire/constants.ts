export const FIRE_MAX_DPR = 2;

/** A representative moment shown when motion is reduced. */
export const FIRE_STILL_SECONDS = 2.3;

export const FIRE_MAX_FRAME_STEP_MS = 100;

export const FIRE_FLAME_PARTICLES = 340;
export const FIRE_EMBER_PARTICLES = 56;

/** Fire size relative to the shorter canvas side. */
export const FIRE_SCALE = 1.22;

/** Flame base sits below center so tongues and rising embers share the card. */
export const FIRE_BASE_OFFSET = 0.3;

export const FIRE_TONGUES = [
  { x: -0.105, height: 0.3, width: 0.072, weight: 0.28 },
  { x: 0, height: 0.46, width: 0.1, weight: 0.44 },
  { x: 0.115, height: 0.34, width: 0.078, weight: 0.28 },
] as const;

export const FIRE_LOGS = [
  { from: { x: -0.27, y: 0.055 }, to: { x: 0.27, y: -0.01 } },
  { from: { x: -0.27, y: -0.01 }, to: { x: 0.27, y: 0.055 } },
] as const;
