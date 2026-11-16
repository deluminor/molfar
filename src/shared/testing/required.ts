/** Narrows a value a test expects to exist, failing the test with `what` when it does not. */
export function required<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined)
    throw new Error(`Expected ${what} to exist`);
  return value;
}
