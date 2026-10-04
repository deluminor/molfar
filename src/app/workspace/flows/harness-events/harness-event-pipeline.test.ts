import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import type { HarnessEvent } from "@/integrations/harness/core/types";
import { createHarnessEventPipeline } from "./harness-event-pipeline";
import type { ScheduledFlush } from "./harness-flush";

function setup(isForeground: () => boolean = () => true) {
  let sessions: Session[] = [
    { ...testSession("claude", "/repo"), id: "a" },
    { ...testSession("claude", "/repo"), id: "b" },
  ];
  const scheduled: Array<{ run: () => void; handle: ScheduledFlush }> = [];
  let nextId = 1;
  const commitSessions = vi.fn((next: Session[]) => {
    sessions = next;
  });
  const cancel = vi.fn((handle: ScheduledFlush | null) => {
    const index = scheduled.findIndex((entry) => entry.handle === handle);
    if (index >= 0) scheduled.splice(index, 1);
  });
  const pipeline = createHarnessEventPipeline({
    readSessions: () => sessions,
    commitSessions,
    isForeground,
    schedule: (run, foreground) => {
      const handle: ScheduledFlush = {
        kind: foreground ? "raf" : "timeout",
        id: nextId++,
      };
      scheduled.push({ run, handle });
      return handle;
    },
    cancel,
  });

  return {
    pipeline,
    scheduled,
    commitSessions,
    text: (id: string) =>
      sessions
        .find((session) => session.id === id)
        ?.blocks.map((block) => block.text)
        .join("|"),
  };
}

const delta = (text: string): HarnessEvent => ({ type: "message.delta", text });

describe("createHarnessEventPipeline", () => {
  it("queues events and applies each session's batch in one commit", () => {
    const { pipeline, scheduled, commitSessions, text } = setup();

    pipeline.enqueue("a", delta("Hel"));
    pipeline.enqueue("a", delta("lo"));
    pipeline.enqueue("b", delta("Hi"));
    expect(commitSessions).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.run();

    expect(commitSessions).toHaveBeenCalledTimes(1);
    expect(text("a")).toBe("Hello");
    expect(text("b")).toBe("Hi");
  });

  it("applies an approval at once, after the session's queued events", () => {
    const { pipeline, commitSessions, text } = setup();

    pipeline.enqueue("a", delta("Running"));
    pipeline.enqueue("a", {
      type: "approval.requested",
      requestId: 1,
      title: "Run npm test",
    });

    expect(commitSessions).toHaveBeenCalledTimes(1);
    expect(text("a")).toContain("Running");
  });

  it("moves a background timer to the next frame once output is visible", () => {
    let foreground = false;
    const { pipeline, scheduled } = setup(() => foreground);

    pipeline.enqueue("a", delta("x"));
    expect(scheduled.map((entry) => entry.handle.kind)).toEqual(["timeout"]);

    foreground = true;
    pipeline.enqueue("a", delta("y"));

    expect(scheduled.map((entry) => entry.handle.kind)).toEqual(["raf"]);
  });

  it("does not commit when a flush changes nothing", () => {
    const { pipeline, commitSessions } = setup();

    pipeline.flush();

    expect(commitSessions).not.toHaveBeenCalled();
  });

  it("cancels a pending flush on dispose", () => {
    const { pipeline, scheduled } = setup();
    pipeline.enqueue("a", delta("x"));

    pipeline.dispose();

    expect(scheduled).toHaveLength(0);
  });
});
