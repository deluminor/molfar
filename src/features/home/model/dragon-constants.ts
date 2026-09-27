import { DRAGON_ROWS } from "./dragon-art";

/** Authored grid extents and padding shared by SVG and Canvas. */
export const DRAGON_COLUMNS = Math.max(...DRAGON_ROWS.map((row) => row.length));
export const DRAGON_LINES = DRAGON_ROWS.length;
export const DRAGON_PADDING = 6;
export const DRAGON_VIEW_WIDTH = DRAGON_COLUMNS + DRAGON_PADDING * 2;
export const DRAGON_VIEW_HEIGHT = DRAGON_LINES + DRAGON_PADDING * 2 + 16;
export const DRAGON_PIXEL_SIZE = 0.8;

/** Tonal separation keeps wing membranes behind the body and wing fingers. */
export const DRAGON_TONES = new Map([
  ["m", 0.38],
  ["s", 0.52],
  ["r", 0.76],
  ["b", 0.98],
  ["e", 1],
]);

/** Particle settings use grid cells and seconds, independent of card size. */
export const DRAGON_PARTICLE_INTERVAL = 0.12;
export const DRAGON_PARTICLE_LIMIT = 36;
export const DRAGON_PARTICLE_GRAVITY = 1.5;
