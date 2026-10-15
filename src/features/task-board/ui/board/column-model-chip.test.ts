// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./StageModelEditor", () => ({
  StageModelEditor: ({ onChange }: { onChange: (config: { harness: string; model: string; runtimeMode: string }) => void }) =>
    createPortal(
      createElement(
        "div",
        { "data-model-picker": "" },
        createElement("button", { type: "button", onClick: () => onChange({ harness: "claude", model: "opus", runtimeMode: "auto" }) }, "Opus"),
      ),
      document.body,
    ),
}));

import { ColumnModelChip } from "./ColumnModelChip";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("ColumnModelChip", () => {
  it("keeps the popover open for a click inside a portalled picker menu", () => {
    const onChange = vi.fn();
    act(() => root.render(createElement(ColumnModelChip, { label: "Grill", config: undefined, project: "/code/app", onChange })));
    act(() => container.querySelector("button")?.click());

    const option = document.querySelector("[data-model-picker] button");
    if (!(option instanceof HTMLButtonElement)) throw new Error("picker option missing");
    act(() => {
      option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => option.click());

    expect(onChange).toHaveBeenCalledWith({ harness: "claude", model: "opus", runtimeMode: "auto" });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
