/** Stable pseudo-random value in [0, 1) so every frame is a pure function of time. */
export function fireHash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;

  return value - Math.floor(value);
}
