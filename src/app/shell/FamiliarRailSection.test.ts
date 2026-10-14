// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFamiliar } from "../../features/familiars/model/familiar";
import { loadFamiliarsEnabled } from "../../features/settings/model/settings";
import { FamiliarRailSection } from "./FamiliarRailSection";

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(props: Partial<Parameters<typeof FamiliarRailSection>[0]> = {}) {
  const onCreate = vi.fn();
  act(() =>
    root.render(
      createElement(FamiliarRailSection, {
        states: new Map(),
        onOpen: () => {},
        onCreate,
        onDelete: () => {},
        ...props,
      }),
    ),
  );
  return onCreate;
}

const intro = () => document.body.querySelector('[aria-label="Meet Familiars"]');
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find(
    (entry) => entry.textContent === label,
  )!;

it("shows the intro card in place of the list while there is no familiar", () => {
  const onCreate = render();
  expect(intro()).not.toBeNull();
  expect(container.querySelector('[aria-label="New familiar"]')).toBeNull();

  act(() => button("Create familiar").click());
  expect(onCreate).toHaveBeenCalledOnce();
});

it("turns familiars off from the intro's switch", () => {
  render();
  act(() => container.querySelector<HTMLElement>('[role="switch"]')!.click());
  expect(loadFamiliarsEnabled()).toBe(false);
});

it("lists familiars once there are some, with the plus in the header", () => {
  createFamiliar();
  render();
  expect(intro()).toBeNull();
  expect(container.querySelectorAll('[aria-label="New familiar"]')).toHaveLength(1);
});

it("counts a familiar's unread replies, except the one open", () => {
  const familiar = createFamiliar();
  const badge = () => container.querySelector("[data-familiar-unread]");
  render({ unseenCounts: new Map([[familiar.id, 3]]) });
  expect(badge()?.textContent).toBe("3");
  expect(
    container.querySelector(`[aria-label*="3 new replies"]`),
  ).not.toBeNull();

  render({ unseenCounts: new Map([[familiar.id, 120]]) });
  expect(badge()?.textContent).toBe("99+");

  render({ activeId: familiar.id, unseenCounts: new Map([[familiar.id, 3]]) });
  expect(badge()).toBeNull();
});
