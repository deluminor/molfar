// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KnowledgeTree } from "./KnowledgeTree";

let root: Root;
let container: HTMLDivElement;
const entries = [
  { path: "Work", name: "Work", isDir: true, isMarkdown: false },
  { path: "Work/Ideas", name: "Ideas", isDir: true, isMarkdown: false },
  {
    path: "Work/Ideas/Graph.md",
    name: "Graph.md",
    isDir: false,
    isMarkdown: true,
  },
];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("reveals an externally selected note and still allows collapsing its folders", async () => {
  const onSelect = vi.fn();
  const render = async (selectedPath: string | null) => {
    await act(async () =>
      root.render(
        createElement(KnowledgeTree, {
          entries,
          query: "",
          selectedPath,
          onSelect,
        }),
      ),
    );
  };
  await render(null);
  expect(container.querySelector('[title="Work/Ideas/Graph.md"]')).toBeNull();

  await render("Work/Ideas/Graph.md");
  const note = container.querySelector<HTMLButtonElement>(
    '[title="Work/Ideas/Graph.md"]',
  );
  expect(note?.getAttribute("aria-current")).toBe("page");
  await act(async () => note?.click());
  expect(onSelect).toHaveBeenCalledWith("Work/Ideas/Graph.md");

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[title="Work"]')?.click(),
  );
  expect(container.querySelector('[title="Work/Ideas/Graph.md"]')).toBeNull();
});
