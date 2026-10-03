// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

vi.mock("@/features/source-control/hooks/use-project-diff-stats", () => ({
  useProjectDiffStats: () => null,
}));
vi.mock("@/features/source-control/hooks/use-git-file-statuses", () => ({
  useGitFileStatuses: () => ({ files: new Map(), dirs: new Map() }),
}));
vi.mock("./SidebarUpdate", () => ({ SidebarUpdateFooter: () => null }));
vi.mock("@/features/files/ui/FileTree", () => ({ FileTree: () => null }));

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
  localStorage.clear();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "puts Knowledge immediately below Notes with project rail open=%s",
  (projectRailOpen) => {
    const onOpenKnowledge = vi.fn();
    const props: ComponentProps<typeof Sidebar> = {
      cwd: "/workspace/project",
      open: false,
      sessions: [],
      busySessionIds: new Set(),
      approvalSessionIds: new Set(),
      status: "idle",
      pending: false,
      tab: "sessions",
      filesSearchOpen: false,
      onSelectSession: vi.fn(),
      onRenameSession: vi.fn(),
      onOpenFile: vi.fn(),
      onTabChange: vi.fn(),
      onFilesSearchOpenChange: vi.fn(),
      onSelectProject: vi.fn(),
      onOpenProject: vi.fn(),
      onOpenNotes: vi.fn(),
      onOpenKnowledge,
      knowledgeActive: true,
      notesActive: false,
      projectRailOpen,
      compactProjectRail: true,
    };
    act(() => root.render(createElement(Sidebar, props)));
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
    ];
    const notes = buttons.findIndex(
      (button) => button.getAttribute("aria-label") === "Notes",
    );
    expect(notes).toBeGreaterThanOrEqual(0);
    const knowledge = buttons[notes + 1];
    expect(knowledge.getAttribute("aria-label")).toBe("Knowledge");
    expect(knowledge.className).toMatch(/selection/);
    act(() => knowledge.click());
    expect(onOpenKnowledge).toHaveBeenCalledOnce();
  },
);
