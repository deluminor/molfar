import { beforeEach, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { newSession } from "@/features/sessions/model/session";
import { syncBoardDockBadge, syncDockBadge } from "./dock-badge";

beforeEach(() => invoke.mockClear());

it("adds Task Board cards waiting on the user to the Dock badge", () => {
  const waiting = { ...newSession("claude", "/code/app"), pendingQuestion: { requestId: 1, questions: [] } };
  syncDockBadge([waiting as never]);
  syncBoardDockBadge(2);
  syncBoardDockBadge(2);

  expect(invoke.mock.calls.map(([, args]) => args)).toEqual([{ count: 1 }, { count: 3 }]);
});
