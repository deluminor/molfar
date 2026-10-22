import { useCallback, useRef } from "react";

/** Runs a command once when the menu accelerator and the key handler both fire it. */
export function useCommandRunner(): (name: string, fn: () => void) => void {
  const last = useRef({ name: "", at: 0 });
  return useCallback((name: string, fn: () => void) => {
    const now = performance.now();
    if (name === last.current.name && now - last.current.at < 80) return;
    last.current = { name, at: now };
    fn();
  }, []);
}
