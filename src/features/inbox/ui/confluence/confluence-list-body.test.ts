// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfluenceNode } from "../../model/confluence/types";
import { ConfluenceListBody } from "./ConfluenceListBody";

const node: ConfluenceNode = {
  id: "1",
  title: "Runbook",
  kind: "page",
  spaceId: "s",
  spaceKey: "TB",
  parentId: "",
  url: "https://example.com/1",
  hasChildren: false,
  readable: true,
};

let container: HTMLDivElement;
let root: Root;

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

function render(
  overrides: Partial<ComponentProps<typeof ConfluenceListBody>>,
): string {
  const props: ComponentProps<typeof ConfluenceListBody> = {
    error: null,
    rootState: undefined,
    searchHits: null,
    searching: false,
    selectedId: null,
    expanded: new Set(),
    tree: {},
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  };
  act(() => root.render(createElement(ConfluenceListBody, props)));

  return container.textContent ?? "";
}

describe("ConfluenceListBody", () => {
  it("shows the panel error when nothing else is listed", () => {
    expect(render({ error: "Token invalid" })).toBe("Token invalid");
  });

  it("prefers search results over the panel error", () => {
    expect(render({ error: "Token invalid", searchHits: [node] })).toContain(
      "Runbook",
    );
  });

  it("reports empty search results", () => {
    expect(render({ searchHits: [] })).toBe("No matching pages");
  });

  it("shows a spinner while searching", () => {
    render({ searchHits: [node], searching: true });

    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.textContent).not.toContain("Runbook");
  });

  it("shows the root error when the space failed to load", () => {
    expect(
      render({
        rootState: { loading: false, error: "Forbidden", children: [] },
      }),
    ).toBe("Forbidden");
  });

  it("reports an empty space", () => {
    expect(
      render({ rootState: { loading: false, error: null, children: [] } }),
    ).toBe("This space has no pages yet");
  });

  it("lists root pages", () => {
    expect(
      render({ rootState: { loading: false, error: null, children: [node] } }),
    ).toContain("Runbook");
  });
});
