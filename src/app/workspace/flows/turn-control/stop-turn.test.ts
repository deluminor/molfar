// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedMessage } from "@/domain/session/message-queue";
import { stoppedSession, stopTurn } from "./stop-turn";
import { setupTurnControl } from "./turn-control.fixture";

const calls = vi.hoisted(() => ({ cancelled: [] as string[], stopped: [] as string[] }));

vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  cancelHarnessTurn: async (harness: string) => {
    calls.cancelled.push(harness);
  },
  stopHarnessSession: async (harness: string) => {
    calls.stopped.push(harness);
  },
}));
vi.mock("@/features/sessions/model/checkpoint", () => ({
  finishSessionTurn: vi.fn(async () => undefined),
  notifyReviewChanged: vi.fn(),
}));
vi.mock("@/platform/tauri/fs", () => ({ notifyGitChanged: vi.fn() }));
vi.mock("@/features/files/model/file-watch", () => ({ nudgeWatchedFiles: vi.fn() }));
vi.mock("../../../model/nudge-workspace", () => ({ nudgeWorkspace: vi.fn() }));

const queued: QueuedMessage = { id: "q", text: "next", attachments: [] };

describe("stoppedSession", () => {
  it("ends streaming and pauses a waiting queue", () => {
    const { session } = setupTurnControl({
      busy: true,
      worktreePreparing: true,
      queuedMessages: [queued],
    });

    const stopped = stoppedSession(session());

    expect(stopped.busy).toBeFalsy();
    expect(stopped.worktreePreparing).toBeUndefined();
    expect(stopped.queueStatus).toBe("paused");
  });

  it("leaves the queue status alone when nothing waits", () => {
    const { session } = setupTurnControl({ busy: true });

    expect(stoppedSession(session()).queueStatus).toBeUndefined();
  });
});

describe("stopTurn", () => {
  beforeEach(() => {
    calls.cancelled = [];
    calls.stopped = [];
  });

  it("cancels the harness turn, orphans its events and stops the session", async () => {
    const { deps, session } = setupTurnControl({ busy: true });
    deps.turnGen.set("s", 3);

    await stopTurn(deps, "s");

    expect(deps.turnGen.get("s")).toBe(4);
    expect(deps.flushHarnessEvents).toHaveBeenCalled();
    expect(calls.cancelled).toEqual(["claude"]);
    expect(calls.stopped).toEqual(["claude"]);
    expect(session().busy).toBeFalsy();
  });
});
