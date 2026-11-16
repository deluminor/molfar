// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("../../../sessions/ui/AgentMarkdown", () => ({
  AgentMarkdown: ({ text }: { text: string }) => text,
}));
import { taskBoardClient } from "../../api/task-board-client";
import { taskGitClient } from "../../api/git-client";
import type { TaskBoardRuntime } from "../../hooks/use-task-board-engine";
import type { Card } from "../../types/card";
import { CardDetailDrawer } from "./CardDetailDrawer";
import { timelineCard, timelineRun } from "./timeline/fixtures.test-support";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("removes previous card modal and inspection immediately through pending and failed replacement loads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let rejectNext: (reason: Error) => void = () => {
    throw new Error("Request not started");
  };
  const pending = new Promise<Card | null>((_resolve, reject) => {
    rejectNext = reject;
  });
  vi.spyOn(taskBoardClient, "getCard").mockImplementation((id) =>
    id === "c" ? Promise.resolve(timelineCard) : pending,
  );
  vi.spyOn(taskBoardClient, "listRuns").mockResolvedValue([timelineRun()]);
  vi.spyOn(taskBoardClient, "listArtifacts").mockResolvedValue([]);
  const runtime: TaskBoardRuntime = {
    ports: {
      store: taskBoardClient,
      git: taskGitClient,
      projects: () => [],
      now: Date.now,
      newId: () => "id",
      notify: { notify: () => {} },
      sessions: {
        launch: async () => {},
        stop: async () => {},
        state: () => "idle",
        turnText: () => "",
        needsInput: () => false,
      },
    },
    create: async () => timelineCard,
    act: async () => timelineCard,
    needsInput: () => false,
  };
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const render = (cardId: string) =>
    root?.render(
      createElement(CardDetailDrawer, {
        runtime,
        cardId,
        stallMinutes: 45,
        intent: null,
        intentSeq: 0,
        onClose: vi.fn(),
        onOpenSession: vi.fn(),
        onMove: vi.fn(),
      }),
    );
  await act(async () => render("c"));
  const expand = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Expand timeline",
  );
  expect(expand).toBeDefined();
  act(() => expand?.click());
  const inspect = document.querySelector<HTMLElement>(
    '[aria-label="Inspect Implement"]',
  );
  act(() => inspect?.focus());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector("[data-dialog-popover]")).not.toBeNull();
  act(() => render("next"));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector("[data-dialog-popover]")).toBeNull();
  expect(document.querySelector('[aria-label="Open session"]')).toBeNull();
  await act(async () => rejectNext(new Error("Replacement load failed")));
  expect(container.textContent).toContain("Replacement load failed");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[aria-label="Open session"]')).toBeNull();
});
