// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { installModalEscape, pushModalEscape } from "./modalEscape";

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe("modalEscape", () => {
  it("closes only the top modal, ahead of views that registered later", () => {
    installModalEscape();
    const view = vi.fn();
    window.addEventListener("keydown", view, true);
    const lower = vi.fn();
    const upper = vi.fn();
    const popLower = pushModalEscape({ current: lower });
    const popUpper = pushModalEscape({ current: upper });

    const event = pressEscape();

    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    expect(view).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    popUpper();
    pressEscape();
    expect(lower).toHaveBeenCalledTimes(1);

    popLower();
    pressEscape();
    expect(view).toHaveBeenCalledTimes(1);

    window.removeEventListener("keydown", view, true);
  });

  it("leaves Escape to popovers inside a modal", () => {
    const close = vi.fn();
    const pop = pushModalEscape({ current: close });
    const popover = document.createElement("div");
    popover.setAttribute("data-dialog-popover", "");
    document.body.append(popover);

    popover.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(close).not.toHaveBeenCalled();

    popover.remove();
    pop();
  });
});
