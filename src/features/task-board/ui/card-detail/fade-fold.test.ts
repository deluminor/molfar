// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FadeFold } from "./FadeFold";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderWithHeight(height: number) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(height);
  act(() => root.render(createElement(FadeFold, { label: "the task" }, createElement("p", null, "Body"))));
  return container.querySelector<HTMLElement>("[data-fold]");
}

describe("FadeFold", () => {
  it("shows short content whole, with no toggle", () => {
    const fold = renderWithHeight(200);

    expect(fold?.dataset.fold).toBe("whole");
    expect(fold?.style.maxHeight).toBe("");
    expect(container.querySelector("button")).toBeNull();
  });

  it("collapses long content and unfolds it to its full height", () => {
    const fold = renderWithHeight(900);
    const toggle = container.querySelector("button");

    expect(fold?.dataset.fold).toBe("closed");
    expect(fold?.style.maxHeight).toBe("240px");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBe(fold?.id);

    act(() => toggle?.click());
    expect(fold?.dataset.fold).toBe("open");
    expect(fold?.style.maxHeight).toBe("900px");
    expect(toggle?.textContent).toContain("Show less");

    act(() => toggle?.click());
    expect(fold?.dataset.fold).toBe("closed");
  });
});
