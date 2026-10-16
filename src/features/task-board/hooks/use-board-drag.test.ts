// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DropTarget } from "../model/transitions";
import type { BoardColumn, Card } from "../types/card";
import { edgeScrollStep } from "./board-drag-geometry";
import { useBoardDrag, type BoardDrag } from "./use-board-drag";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let drag: BoardDrag;
let pointAt: BoardColumn | null;
const onDrop = vi.fn<(card: Card, target: DropTarget) => void>();
const onOpen = vi.fn();

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    number: 1,
    projectCwd: "/code/app",
    title: "Task",
    description: "",
    acceptanceCriteria: "",
    columnId: "backlog",
    runState: "idle",
    position: 0,
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

function Harness({ cards }: { cards: Card[] }): ReactNode {
  drag = useBoardDrag(cards, onDrop);
  return createElement("button", {
    type: "button",
    "data-card": "",
    onPointerDown: (event: Parameters<BoardDrag["start"]>[1]) => drag.start("c1", event),
    onClick: onOpen,
  });
}

const handle = () => container.querySelector("[data-card]") as HTMLButtonElement;

function pointer(type: string, x: number, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 10 }));
  });
}

function render(cards: Card[]) {
  act(() => root.render(createElement(Harness, { cards })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  pointAt = null;
  document.elementFromPoint = () => {
    if (!pointAt) return null;
    const column = document.createElement("section");
    column.dataset.boardColumn = pointAt;
    return column;
  };
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  onDrop.mockClear();
  onOpen.mockClear();
});

describe("useBoardDrag", () => {
  it("drops a backlog card on Grill as a start", () => {
    render([card()]);

    pointer("pointerdown", 0, handle());
    pointAt = "grill";
    pointer("pointermove", 40);

    expect(drag.draggingId).toBe("c1");
    expect(drag.overColumn).toBe("grill");
    expect([...drag.targets.keys()]).toEqual(["grill"]);

    pointer("pointerup", 40);

    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), { column: "grill", action: "start", needsInput: false });
    expect(drag.draggingId).toBeNull();
  });

  it("ignores a drop on a column the card may not enter", () => {
    render([card()]);

    pointer("pointerdown", 0, handle());
    pointAt = "done";
    pointer("pointermove", 40);
    pointer("pointerup", 40);

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("treats a press below the threshold as a click", () => {
    render([card()]);

    pointer("pointerdown", 0, handle());
    pointer("pointermove", 2);
    pointer("pointerup", 2);
    act(() => handle().click());

    expect(drag.draggingId).toBeNull();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("swallows the click that ends a drag", () => {
    render([card()]);

    pointer("pointerdown", 0, handle());
    pointAt = "grill";
    pointer("pointermove", 40);
    pointer("pointerup", 40);
    act(() => handle().click());

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("cancels on Escape without closing the drawer behind it", () => {
    const drawerEscape = vi.fn();
    window.addEventListener("keydown", drawerEscape);
    render([card()]);

    pointer("pointerdown", 0, handle());
    pointAt = "grill";
    pointer("pointermove", 40);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    pointer("pointerup", 40);
    window.removeEventListener("keydown", drawerEscape);

    expect(drag.draggingId).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
    expect(drawerEscape).not.toHaveBeenCalled();
  });

  it("re-checks legality against the card's latest state at drop time", () => {
    render([card()]);

    pointer("pointerdown", 0, handle());
    pointAt = "grill";
    pointer("pointermove", 40);
    render([card({ columnId: "grill", runState: "queued" })]);
    pointer("pointerup", 40);

    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe("edgeScrollStep", () => {
  const rect = { left: 100, right: 900 };

  it("stays still away from the edges", () => {
    expect(edgeScrollStep(500, rect)).toBe(0);
  });

  it("scrolls toward the near edge, faster closer in", () => {
    expect(edgeScrollStep(110, rect)).toBeLessThan(0);
    expect(edgeScrollStep(890, rect)).toBeGreaterThan(0);
    expect(edgeScrollStep(899, rect)).toBeGreaterThan(edgeScrollStep(860, rect));
  });
});
