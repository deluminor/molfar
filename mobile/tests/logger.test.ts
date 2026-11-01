import { afterEach, expect, it, vi } from "vitest";
import { logDebug } from "../src/utils/logger";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("logs named development events with their measurement fields", () => {
  vi.stubGlobal("__DEV__", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

  logDebug("ui.render", { name: "screen", phase: "mount", durationMs: 12 });

  expect(debug).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ event: "ui.render", name: "screen", phase: "mount", durationMs: 12 }),
  );
});

it("does not emit diagnostic events in production", () => {
  vi.stubGlobal("__DEV__", false);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

  logDebug("transcript.scroll", { message: "send" });

  expect(debug).not.toHaveBeenCalled();
});
