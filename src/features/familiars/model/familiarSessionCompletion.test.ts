import { describe, expect, it } from "vitest";
import { submitWithSettlement } from "../../../app/model/managedSubmission";
import type { ControlOutcome } from "../../orchestration/model/orchestration";
import {
  canDispatchQueuedHead,
  canSteerQueuedHead,
  dequeueQueuedMessage,
  queuedMessageForSubmit,
} from "../../sessions/model/messageQueue";
import { newSession, type Session } from "../../sessions/model/session";
import {
  enqueueFamiliarSessionCompletion,
  familiarSessionCompletionMessage,
} from "./familiarSessionCompletion";

const options = {
  requestId: "app-familiar-request",
  sessionId: "worker",
  project: "/code/project",
  prompt: "Fix the API and run tests",
  outcome: {
    status: "completed",
    text: "The API is fixed and tests pass.",
  } as ControlOutcome,
};

describe("Familiar session completion notifications", () => {
  it("accepts immediately, then queues completion behind chat without steering a busy Familiar", async () => {
    let familiar: Session = {
      ...newSession("codex", "/code/project"),
      busy: true,
      turnReady: true,
      queuedMessages: [
        { id: "chat", text: "Also explain the design", attachments: [] },
      ],
    };
    let settle!: (outcome: ControlOutcome) => void;
    await expect(
      submitWithSettlement({
        submit: (done) => {
          settle = done;
          return true;
        },
        onSettled: (outcome) => {
          familiar = enqueueFamiliarSessionCompletion(
            familiar,
            familiarSessionCompletionMessage({ ...options, outcome }),
          );
        },
        rejectionMessage: "Could not start",
      }),
    ).resolves.toBe(true);
    expect(familiar.queuedMessages).toHaveLength(1);
    settle(options.outcome);
    settle(options.outcome);
    expect(familiar.queuedMessages?.map((message) => message.id)).toEqual([
      "chat",
      "familiar-completion-app-familiar-request",
    ]);
    const next = dequeueQueuedMessage(familiar, "chat");
    expect(canSteerQueuedHead(next)).toBe(false);
    expect(
      queuedMessageForSubmit(next, "familiar-completion-app-familiar-request", "steer"),
    ).toBeUndefined();
    expect(canDispatchQueuedHead(next)).toBe(false);
    expect(canDispatchQueuedHead({ ...next, busy: false })).toBe(true);
  });

  it("uses the final answer from the watched turn even after a later turn begins", () => {
    const session = newSession("codex", options.project);
    session.title = "API fix";
    session.blocks = [
      {
        id: "u",
        role: "user",
        text: options.prompt,
        appRequestId: options.requestId,
      },
      { id: "progress", role: "assistant", text: "I am checking" },
      {
        id: "tool",
        role: "tool",
        text: "private tool output",
        tool: { kind: "shell" },
      },
      {
        id: "reply",
        role: "assistant",
        text: "Fixed the endpoint; 12 tests pass.",
      },
      { id: "later", role: "user", text: "New task" },
      { id: "later-reply", role: "assistant", text: "Unrelated answer" },
    ];
    const message = familiarSessionCompletionMessage({ ...options, session });
    expect(message.text).toContain("Fixed the endpoint; 12 tests pass.");
    expect(message.text).toContain(options.project);
    expect(message.text).toContain(options.prompt);
    expect(message.text).not.toContain("Unrelated answer");
    expect(message.text).not.toContain("private tool output");
    expect(message.familiarSessionCompletion).toEqual({
      sessionId: "worker",
      title: "API fix",
      status: "completed",
    });
  });

  it.each(["failed", "cancelled"] as const)(
    "reports %s with available output and an error",
    (status) => {
      const message = familiarSessionCompletionMessage({
        ...options,
        outcome: { status, text: "Partial work", error: "Agent stopped" },
      });
      expect(message.familiarSessionCompletion?.status).toBe(status);
      expect(message.text).toContain("Partial work");
      expect(message.text).toContain("Agent stopped");
    },
  );

  it("deduplicates both pending and consumed receipts and preserves a paused queue", () => {
    const familiar = newSession("codex", options.project);
    const message = familiarSessionCompletionMessage(options);
    const next = enqueueFamiliarSessionCompletion(
      { ...familiar, queueStatus: "paused" },
      message,
    );
    expect(next.queueStatus).toBe("paused");
    expect(enqueueFamiliarSessionCompletion(next, message)).toBe(next);
    const delivered = {
      ...familiar,
      blocks: [
        {
          id: "notice",
          role: "user" as const,
          text: message.text,
          appRequestId: message.id,
          internal: true,
        },
      ],
    };
    expect(enqueueFamiliarSessionCompletion(delivered, message)).toBe(delivered);
  });

  it("bounds long results and points the Familiar to the source conversation", () => {
    const message = familiarSessionCompletionMessage({
      ...options,
      outcome: { status: "completed", text: "x".repeat(15_000) },
    });
    expect(message.text).toContain('"truncated":true');
    expect(message.text).toContain("app sessions.read");
    expect(message.text.length).toBeLessThan(13_000);
  });
});
