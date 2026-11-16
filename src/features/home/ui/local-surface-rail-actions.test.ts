// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RAIL_SURFACES_DEFAULT } from "@/features/settings/model/project-rail";
import { LocalSurfaceRailActions } from "./LocalSurfaceRailActions";

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

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")];
}

it("renders Home, Usage and Board and marks only the active surface", () => {
  act(() =>
    root.render(
      createElement(LocalSurfaceRailActions, {
        active: "usage",
        visible: RAIL_SURFACES_DEFAULT,
        onOpen: vi.fn(),
      }),
    ),
  );
  const [home, usage] = buttons();
  expect(buttons().map((button) => button.getAttribute("aria-label"))).toEqual([
    "Home",
    "Usage",
    "Board",
  ]);
  expect(home.className).not.toContain("bg-selection");
  expect(usage.className).toContain("bg-selection");
});

it("reports which surface was clicked", () => {
  const onOpen = vi.fn();
  act(() =>
    root.render(
      createElement(LocalSurfaceRailActions, {
        active: null,
        visible: RAIL_SURFACES_DEFAULT,
        onOpen,
      }),
    ),
  );
  const [home, usage] = buttons();
  act(() => home.click());
  act(() => usage.click());
  expect(onOpen.mock.calls).toEqual([["home"], ["usage"]]);
});

it("leaves out surfaces hidden in Settings", () => {
  act(() =>
    root.render(
      createElement(LocalSurfaceRailActions, {
        active: null,
        visible: { ...RAIL_SURFACES_DEFAULT, home: false },
        onOpen: vi.fn(),
      }),
    ),
  );

  expect(buttons().map((button) => button.getAttribute("aria-label"))).toEqual([
    "Usage",
    "Board",
  ]);
});

it("badges Board with the cards waiting on the user", () => {
  act(() =>
    root.render(
      createElement(LocalSurfaceRailActions, {
        active: null,
        visible: RAIL_SURFACES_DEFAULT,
        onOpen: vi.fn(),
        badges: { board: 3 },
      }),
    ),
  );
  const board = buttons().find((button) => button.getAttribute("aria-label")?.startsWith("Board"));
  expect(board?.getAttribute("aria-label")).toBe("Board, 3 waiting on you");
  expect(board?.textContent).toContain("3");
});
