// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { confirmApp } = vi.hoisted(() => ({ confirmApp: vi.fn(async () => true) }));
vi.mock("@/shared/lib/app-dialog", () => ({ confirmApp }));
vi.mock("../board/StageModelEditor", () => ({ StageModelEditor: () => null }));

import type { Card } from "../../types/card";
import { GateActions } from "./GateActions";
import { QuestionsForm } from "./QuestionsForm";
import { ReviewChecklist } from "./ReviewChecklist";

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
  confirmApp.mockClear();
});

const labels = () => [...container.querySelectorAll("button")].map((button) => button.textContent?.trim());
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((entry) => entry.textContent?.includes(text)) as HTMLButtonElement;

function card(overrides: Partial<Card>): Card {
  return {
    id: "c1",
    number: 1,
    projectCwd: "/code/app",
    title: "Board",
    description: "Do it",
    acceptanceCriteria: "",
    columnId: "backlog",
    runState: "idle",
    position: 1,
    baseRef: null,
    baseSha: null,
    branch: null,
    worktreePath: null,
    grillRound: 0,
    reworkCycle: 0,
    overridesJson: "{}",
    lastError: null,
    deliveryJson: null,
    archived: false,
    queuedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("QuestionsForm", () => {
  it("prefills recommendations and sends edited answers with the note", async () => {
    const onAnswer = vi.fn(async () => undefined);
    act(() =>
      root.render(
        createElement(QuestionsForm, {
          markdown: "## Q1 — Storage\nWhere?\n**Recommended:** App data",
          editable: true,
          focusNote: false,
          onAnswer,
          onRequestChanges: vi.fn(async () => undefined),
        }),
      ),
    );
    const [answer] = [...container.querySelectorAll("textarea")];
    expect(answer.value).toBe("App data");

    await act(async () => button("Answer & re-grill").click());
    expect(onAnswer).toHaveBeenCalledWith([{ number: 1, answer: "App data" }], "");
  });

  it("disables Request changes until a note is written", () => {
    act(() =>
      root.render(
        createElement(QuestionsForm, {
          markdown: "",
          editable: true,
          focusNote: true,
          onAnswer: vi.fn(async () => undefined),
          onRequestChanges: vi.fn(async () => undefined),
        }),
      ),
    );
    expect(labels()).toEqual(["Request changes"]);
    expect(button("Request changes").disabled).toBe(true);
  });
});

describe("ReviewChecklist", () => {
  const markdown = "Verdict: CHANGES_REQUESTED\n## F1 [blocking] A\nx\n## F2 [nit] B\ny";

  it("preselects blocking findings and reworks the selection", async () => {
    const onRework = vi.fn(async () => undefined);
    act(() => root.render(createElement(ReviewChecklist, { markdown, canRework: true, onRework })));
    const boxes = [...container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);

    await act(async () => button("Rework 1 finding").click());
    expect(onRework).toHaveBeenCalledWith(["F1"], "");
  });

  it("is read-only outside the final review gate", () => {
    act(() => root.render(createElement(ReviewChecklist, { markdown, canRework: false, onRework: vi.fn() })));
    expect(labels()).toEqual([]);
  });
});

describe("GateActions", () => {
  const render = (overrides: Partial<Card>, onAct = vi.fn(async () => undefined)) => {
    act(() => root.render(createElement(GateActions, { card: card(overrides), openDelivery: false, github: true, onAct })));
    return onAct;
  };

  it("offers start and reject in the backlog", () => {
    render({});
    expect(labels()).toEqual(["Start grill", "Reject"]);
  });

  it("offers approval at the plan gate", async () => {
    const onAct = render({ columnId: "plan_approval" });
    await act(async () => button("Approve plan").click());
    expect(onAct).toHaveBeenCalledWith({ type: "approvePlan" });
  });

  it("offers only cancel while a stage runs", () => {
    render({ columnId: "implement", runState: "running" });
    expect(labels()).toEqual(["Cancel stage"]);
  });

  it("offers retry, back and reject after a failure", () => {
    render({ columnId: "implement", runState: "failed" });
    expect(labels()).toEqual(["Retry…", "Back", "Reject"]);
  });

  it("confirms before rejecting and before a squash-merge", async () => {
    const onAct = render({ columnId: "final_review" });
    await act(async () => button("Deliver").click());
    await act(async () => button("Squash-merge").click());
    await act(async () => button("Reject").click());

    expect(confirmApp).toHaveBeenCalledTimes(2);
    expect(onAct.mock.calls).toEqual([[{ type: "deliver", method: "merge" }], [{ type: "reject" }]]);
  });

  it("offers only Keep branch without GitHub", async () => {
    act(() =>
      root.render(createElement(GateActions, { card: card({ columnId: "final_review" }), openDelivery: true, github: false, onAct: vi.fn() })),
    );
    expect(labels()).not.toContain("Open pull requestPush the branch and open a PR.");
    expect(button("Keep branch")).toBeTruthy();
    expect(button("Squash-merge")).toBeUndefined();
  });

  it("offers Archive on a delivered card", async () => {
    const onAct = render({ columnId: "done" });
    expect(labels()).toEqual(["Archive"]);
    await act(async () => button("Archive").click());
    expect(confirmApp).toHaveBeenCalledWith(
      "Archive this card? It leaves the board and stays available under Archived.",
      expect.objectContaining({ title: "Archive card", okLabel: "Archive" }),
    );
    expect(onAct).toHaveBeenCalledWith({ type: "reject" });
  });
});
