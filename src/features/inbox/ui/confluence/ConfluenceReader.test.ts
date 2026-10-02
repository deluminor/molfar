// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfluencePage } from "../../model/confluence/types";
import { ConfluenceReader } from "./ConfluenceReader";

vi.mock("../../../sessions/ui/AgentMarkdown", () => ({
  AgentMarkdown: ({ text }: { text: string }) => text,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const page: ConfluencePage = {
  id: "7",
  title: "Architecture",
  kind: "page",
  spaceId: "s",
  spaceKey: "TB",
  parentId: "",
  url: "https://example.com/7",
  body: "Page body",
  readable: true,
  truncated: false,
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
  overrides: Partial<ComponentProps<typeof ConfluenceReader>>,
): string {
  const props: ComponentProps<typeof ConfluenceReader> = {
    cwd: "/repo",
    activeSpace: { id: "s", key: "TB", name: "Trading" },
    selectedId: "7",
    selectedKind: "page",
    page,
    folderChildren: [],
    loadingPage: false,
    error: null,
    sending: false,
    onSendToChat: vi.fn(),
    onCopyMention: vi.fn(),
    ...overrides,
  };
  act(() => root.render(createElement(ConfluenceReader, props)));

  return container.textContent ?? "";
}

describe("ConfluenceReader", () => {
  it("asks for a selection first", () => {
    expect(render({ selectedId: null })).toBe(
      "Select a Confluence page or folder",
    );
  });

  it("shows a spinner while the first load is pending", () => {
    render({ page: null, loadingPage: true });

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("falls back to the error when the page failed", () => {
    expect(render({ page: null, error: "Not found" })).toBe("Not found");
    expect(render({ page: null })).toBe("Could not load this page");
  });

  it("renders a page with its kind and space", () => {
    const text = render({});

    expect(text).toContain("Page · TB");
    expect(text).toContain("Architecture");
    expect(text).toContain("Page body");
  });

  it("renders a folder as a table of contents", () => {
    const text = render({ selectedKind: "folder" });

    expect(text).toContain("Folder · TB");
    expect(text).toContain("Table of contents");
    expect(text).not.toContain("Page body");
  });

  it("labels other content by its kind and notes truncation", () => {
    const text = render({
      selectedKind: "other",
      page: { ...page, kind: "whiteboard", truncated: true },
    });

    expect(text).toContain("whiteboard · TB");
    expect(text).toContain("Body truncated for size.");
  });
});
