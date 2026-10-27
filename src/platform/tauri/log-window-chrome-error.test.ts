import { afterEach, describe, expect, it, vi } from "vitest";
import { logWindowChromeError } from "./log-window-chrome-error";

describe("logWindowChromeError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs real window chrome failures", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logWindowChromeError("minimize", new Error("window gone"));
    expect(error).toHaveBeenCalledWith(
      "[molfar] window chrome: minimize",
      expect.objectContaining({ message: "window gone" }),
    );
  });

  it("skips browser fixture gaps for omitted window plugin commands", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logWindowChromeError(
      "read maximized state",
      new Error("Unavailable fixture service: plugin:window|is_maximized"),
    );
    expect(error).not.toHaveBeenCalled();
  });
});
