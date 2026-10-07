// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFamiliar } from "../../features/familiars/model/familiar";
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

it("offers a new familiar in place of the list, and meets a new user beside it", () => {
  const onCreate = render({ introAvailable: true });
  const add = container.querySelector("[data-familiar-add]");
  expect(add?.getAttribute("aria-label")).toBe("New familiar");
  expect(add?.textContent).toBe("");
  expect(container.querySelectorAll('[aria-label="New familiar"]')).toHaveLength(1);
  expect(intro()).not.toBeNull();

  act(() => button("Create your familiar").click());
  expect(onCreate).toHaveBeenCalledOnce();
  expect(intro()).toBeNull();
});

it("meets the user only once, whichever way they choose", () => {
  render({ introAvailable: true });
  act(() => button("Create your familiar").click());
  act(() => root.unmount());
  root = createRoot(container);
  render({ introAvailable: true });
  expect(intro()).toBeNull();
});

it("stops meeting the user once they pass on it", () => {
  render({ introAvailable: true });
  act(() => button("Not now").click());
  expect(intro()).toBeNull();
  act(() => root.unmount());
  root = createRoot(container);
  render({ introAvailable: true });
  expect(intro()).toBeNull();
  expect(container.querySelector("[data-familiar-add]")).not.toBeNull();
});

it("lists familiars once there are some, with the plus in the header", () => {
  createFamiliar();
  render({ introAvailable: true });
  expect(intro()).toBeNull();
  expect(container.querySelector("[data-familiar-add]")).toBeNull();
  expect(container.querySelectorAll('[aria-label="New familiar"]')).toHaveLength(1);
});
