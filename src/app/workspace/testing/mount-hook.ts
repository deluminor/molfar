import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

export type MountedHook<T> = {
  result: { current: T | undefined };
  rerender(): void;
  unmount(): void;
};

/** Renders a hook in a bare component; `rerender` re-runs it with whatever its closure reads now. */
export function mountHook<T>(hook: () => T): MountedHook<T> {
  const result: { current: T | undefined } = { current: undefined };

  function Probe() {
    result.current = hook();
    return null;
  }

  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return {
    result,
    rerender: () => act(() => root.render(createElement(Probe))),
    unmount: () => act(() => root.unmount()),
  };
}
