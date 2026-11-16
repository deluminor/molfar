import { describe, expect, it } from "vitest";
import { submittableSession } from "./submission-guards";
import { prepareSubmission } from "./submission-preflight";
import { setupSubmission } from "./submission.fixture";

describe("submittableSession", () => {
  it("returns the session that may take a turn", () => {
    const { deps, session } = setupSubmission();

    expect(submittableSession(deps, "s")).toBe(session());
  });

  it("refuses a session being removed or switching worktree", () => {
    const removing = setupSubmission();
    removing.deps.removingSessionIds.current.add("s");
    const switching = setupSubmission();
    switching.deps.switchingWorktrees.current.set("s", "/work/demo-wt");

    expect(submittableSession(removing.deps, "s")).toBeUndefined();
    expect(submittableSession(switching.deps, "s")).toBeUndefined();
  });

  it("refuses a session whose worktree is gone or being removed", () => {
    const removed = setupSubmission({ worktreeRemoved: true });
    const removing = setupSubmission({ worktreeCwd: "/work/demo-wt" });
    removing.deps.removingWorktreePaths.current.add("/work/demo-wt");

    expect(submittableSession(removed.deps, "s")).toBeUndefined();
    expect(submittableSession(removing.deps, "s")).toBeUndefined();
  });

  it("settles a managed submission to a busy session as failed", () => {
    const { deps } = setupSubmission({ busy: true });
    let outcome: unknown;

    submittableSession(deps, "s", { managed: true, onSettled: (settled) => (outcome = settled) });

    expect(outcome).toMatchObject({ status: "failed" });
  });
});

describe("prepareSubmission", () => {
  it("refuses an empty message", () => {
    const { deps, session } = setupSubmission();

    expect(prepareSubmission(deps, session(), "  ", [])).toBeUndefined();
  });

  it("refuses to build without an approved plan", () => {
    const { deps, session } = setupSubmission();

    expect(prepareSubmission(deps, session(), "Build", [], { intent: "build" })).toBeUndefined();
  });

  it("takes /operator off the prompt and grants app access", () => {
    const { deps, session } = setupSubmission();

    const turn = prepareSubmission(deps, session(), "/operator list sessions", []);

    expect(turn).toMatchObject({
      operatorAccess: true,
      promptText: "list sessions",
      harnessText: "list sessions",
      rawCommand: false,
    });
  });

  it("refuses /operator outside a regular turn", () => {
    const { deps, session } = setupSubmission();

    expect(prepareSubmission(deps, session(), "/operator go", [], { intent: "plan" })).toBeUndefined();
    expect(deps.enqueueHarnessEvent).toHaveBeenCalledWith("s", {
      type: "status",
      text: "Use /operator from a regular session turn, outside an orchestration run.",
    });
  });

  it("drops the draft a submission replaces", () => {
    const { deps, session } = setupSubmission({
      blocks: [{ id: "d", role: "user", text: "draft", draft: true }],
    });

    const turn = prepareSubmission(deps, session(), "send it", [], { draftBlockId: "d" });

    expect(turn?.current.blocks).toEqual([]);
    expect(turn?.draftBlock?.id).toBe("d");
  });
});
