import { useRef } from "react";

/** A ref that always holds the latest render's value, for callbacks created once. */
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
