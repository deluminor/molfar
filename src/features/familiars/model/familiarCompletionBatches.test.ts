import { describe, expect, it, vi } from "vitest";
import { submitWithSettlement } from "../../../app/model/managedSubmission";
import {
  canDispatchQueuedHead,
  canSteerQueuedHead,
} from "../../sessions/model/messageQueue";
import { newSession, type Session } from "../../sessions/model/session";
import {
  enqueueFamiliarSessionCompletion,
  familiarSessionCompletionResult,
  FamiliarSessionCompletionBatches,
} from "./familiarSessionCompletion";

const origin = { familiarId: "familiar", turn: 1 };
function result(
  id: string,
  status: "completed" | "failed" | "cancelled" = "completed",
) {
  return familiarSessionCompletionResult({
    requestId: id,
    sessionId: id,
    project: "/code/project",
    prompt: `Review ${id}`,
    outcome: {
      status,
      text: `Result ${id}`,
      ...(status === "failed" ? { error: "Launch failed" } : {}),
    },
  });
}

describe("Familiar completion batches", () => {
  it("waits for the launching turn and all children, even when a fast child finishes before the others launch", () => {
    const ready = vi.fn();
    const batches = new FamiliarSessionCompletionBatches(ready);
    const a = batches.watch(origin, "a");
    a(result("a"));
    batches.closeInactive(() => true);
    expect(ready).not.toHaveBeenCalled();
    const b = batches.watch(origin, "b");
    const c = batches.watch(origin, "c");
    c(result("c"));
    batches.closeInactive(() => false);
    expect(ready).not.toHaveBeenCalled();
    b(result("b"));
    expect(ready).toHaveBeenCalledOnce();
    const [familiarId, message] = ready.mock.calls[0];
    expect(familiarId).toBe("familiar");
    expect(message.familiarSessionCompletion).toMatchObject({
      sessionCount: 3,
      status: "completed",
    });
    const payload = JSON.parse(message.text.split("\n\n")[1]);
    expect(
      payload.sessions.map((entry: { sessionId: string }) => entry.sessionId),
    ).toEqual(["a", "b", "c"]);
    expect(message.text).toContain("one consolidated update");
    for (const id of ["a", "b", "c"])
      expect(message.text).toContain(`Result ${id}`);
    a(result("a"));
    b(result("b"));
    batches.closeInactive(() => false);
    expect(ready).toHaveBeenCalledOnce();
  });

  it("counts failures and cancellations as finished without releasing partial results", async () => {
    const ready = vi.fn();
    const batches = new FamiliarSessionCompletionBatches(ready);
    const failed = batches.watch(origin, "failed");
    const cancelled = batches.watch(origin, "cancelled");
    const succeeded = batches.watch(origin, "success");
    batches.closeInactive(() => false);
    await submitWithSettlement({
      submit: () => false,
      onSettled: (outcome) =>
        failed(
          familiarSessionCompletionResult({
            requestId: "failed",
            sessionId: "failed",
            project: "/code/project",
            prompt: "Review",
            outcome,
          }),
        ),
      rejectionMessage: "Launch failed",
    });
    cancelled(result("cancelled", "cancelled"));
    expect(ready).not.toHaveBeenCalled();
    succeeded(result("success"));
    const message = ready.mock.calls[0][1];
    expect(message.familiarSessionCompletion.status).toBe("failed");
    expect(message.text).toContain("Launch failed");
    expect(message.text).toContain('"status":"cancelled"');
    expect(message.text).toContain('"status":"completed"');
  });

  it("keeps later requests and other Familiars independent of a slow earlier batch", () => {
    const ready = vi.fn();
    const batches = new FamiliarSessionCompletionBatches(ready);
    const slow = batches.watch(origin, "slow");
    batches.watch(origin, "also-slow");
    const later = batches.watch({ ...origin, turn: 2 }, "later");
    const other = batches.watch({ familiarId: "another", turn: 1 }, "other");
    batches.closeInactive(() => false);
    later(result("later"));
    other(result("other"));
    expect(ready.mock.calls.map(([familiarId]) => familiarId)).toEqual([
      "familiar",
      "another",
    ]);
    slow(result("slow"));
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it("queues one consolidated report behind chat and never steers a busy Familiar", () => {
    let familiar: Session = {
      ...newSession("codex", "/code/project"),
      busy: true,
      turnReady: true,
      queuedMessages: [
        { id: "chat", text: "Another question", attachments: [] },
      ],
    };
    const batches = new FamiliarSessionCompletionBatches((_, message) => {
      familiar = enqueueFamiliarSessionCompletion(familiar, message);
    });
    const a = batches.watch(origin, "a");
    const b = batches.watch(origin, "b");
    batches.closeInactive(() => false);
    b(result("b"));
    expect(familiar.queuedMessages).toHaveLength(1);
    a(result("a"));
    expect(familiar.queuedMessages).toHaveLength(2);
    const notification = {
      ...familiar,
      queuedMessages: familiar.queuedMessages!.slice(1),
    };
    expect(canDispatchQueuedHead(notification)).toBe(false);
    expect(canSteerQueuedHead(notification)).toBe(false);
    expect(canDispatchQueuedHead({ ...notification, busy: false })).toBe(true);
  });

  it("keeps single-session reports compatible", () => {
    const ready = vi.fn();
    const batches = new FamiliarSessionCompletionBatches(ready);
    const done = batches.watch(origin, "request");
    const snapshot = result("worker");
    done(snapshot);
    expect(ready).not.toHaveBeenCalled();
    batches.closeInactive(() => false);
    expect(ready.mock.calls[0][1]).toMatchObject({
      id: "familiar-completion-request",
      familiarSessionCompletion: {
        sessionId: "worker",
        title: "Agent session",
        status: "completed",
      },
    });
    expect(ready.mock.calls[0][1].familiarSessionCompletion).not.toHaveProperty(
      "sessionCount",
    );
  });

  it("waits for a retry of a rejected launch and ignores its old settlement callback", () => {
    const ready = vi.fn();
    const batches = new FamiliarSessionCompletionBatches(ready);
    const rejected = batches.watch(origin, "request");
    rejected(result("worker", "failed"));
    const retry = batches.watch(origin, "request");
    batches.closeInactive(() => false);
    rejected(result("worker", "failed"));
    expect(ready).not.toHaveBeenCalled();
    retry(result("worker"));
    expect(ready).toHaveBeenCalledOnce();
    expect(ready.mock.calls[0][1].familiarSessionCompletion.status).toBe(
      "completed",
    );
  });

  it("bounds a large group's reports while retaining every session's identity and outcome", () => {
    const ready = vi.fn();
    const batches = new FamiliarSessionCompletionBatches(ready);
    for (let index = 0; index < 40; index++) {
      const id = `worker-${index}`;
      batches.watch(
        origin,
        id,
      )({
        ...result(id),
        result: "x".repeat(12_000),
        originalPrompt: "y".repeat(12_000),
      });
    }
    batches.closeInactive(() => false);
    const message = ready.mock.calls[0][1];
    const payload = JSON.parse(message.text.split("\n\n")[1]);
    expect(payload.sessions).toHaveLength(40);
    expect(
      payload.sessions.every(
        (entry: { truncated: boolean }) => entry.truncated,
      ),
    ).toBe(true);
    expect(message.text.length).toBeLessThan(60_000);
  });
});
