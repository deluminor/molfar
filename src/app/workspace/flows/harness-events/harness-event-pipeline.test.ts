// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import type { HarnessEvent } from "@/integrations/harness/core/types";
import { createHarnessEventPipeline } from "./harness-event-pipeline";

const frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(() => {
  frames.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runFrames() {
  const pending = [...frames.values()];
  frames.clear();
  for (const run of pending) run(performance.now());
}

function setup(isForeground: (id: string) => boolean = () => true) {
  let sessions: Session[] = [
    { ...testSession("claude", "/repo"), id: "a" },
    { ...testSession("claude", "/repo"), id: "b" },
  ];
  const commitSessions = vi.fn();
  const pipeline = createHarnessEventPipeline({
    updateSessions: (update) => {
      const next = update(sessions);
      if (next === sessions) return;
      sessions = next;
      commitSessions(next);
    },
    isForeground,
  });

  return {
    pipeline,
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
  it("queues visible events and applies each session's batch in one commit", () => {
    const { pipeline, commitSessions, text } = setup();

    pipeline.enqueue("a", delta("Hel"));
    pipeline.enqueue("a", delta("lo"));
    pipeline.enqueue("b", delta("Hi"));
    expect(commitSessions).not.toHaveBeenCalled();

    vi.advanceTimersByTime(40);
    runFrames();

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

  it("keeps hidden streams on their own timer while a visible one flushes", () => {
    const { pipeline, text } = setup((id) => id === "a");

    pipeline.enqueue("a", delta("seen"));
    pipeline.enqueue("b", delta("hidden"));
    pipeline.flushForeground();

    expect(text("a")).toBe("seen");
    expect(text("b")).toBe("");

    vi.advanceTimersByTime(100);

    expect(text("b")).toBe("hidden");
  });

  it("does not commit when a flush changes nothing", () => {
    const { pipeline, commitSessions } = setup();

    pipeline.flush();

    expect(commitSessions).not.toHaveBeenCalled();
  });

  it("drops scheduled flushes on dispose", () => {
    const { pipeline, commitSessions } = setup(() => false);
    pipeline.enqueue("a", delta("x"));

    pipeline.dispose();
    vi.advanceTimersByTime(200);

    expect(commitSessions).not.toHaveBeenCalled();
  });

  it("exposes the foreground check for idle parking", () => {
    const { pipeline } = setup((id) => id === "a");

    expect(pipeline.isForeground("a")).toBe(true);
    expect(pipeline.isForeground("b")).toBe(false);
  });
});
