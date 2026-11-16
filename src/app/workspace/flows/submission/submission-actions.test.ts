import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubmissionActions } from "./submission-actions";
import { setupSubmission } from "./submission.fixture";
import { submitSession } from "./submit-session";

vi.mock("./submit-session", () => ({ submitSession: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

function setup(switching = false) {
  const { deps } = setupSubmission();
  const { submitAfterProjectSyncRef: _, ...rest } = deps;
  const actions = createSubmissionActions({ ...rest, workspaceNavigation: { isSwitching: () => switching } });
  return { actions };
}

describe("createSubmissionActions", () => {
  it("submits with deps whose deferred project sync resubmits through the same entry", () => {
    vi.mocked(submitSession).mockReturnValue(true);
    const { actions } = setup();

    expect(actions.submit("s", "hi")).toBe(true);

    const [bound, ...args] = vi.mocked(submitSession).mock.calls[0];
    expect(args).toEqual(["s", "hi"]);
    expect(bound.submitAfterProjectSyncRef.current).toBe(actions.submit);
  });

  it("refuses to send while the session's tab is switching workspace", () => {
    const { actions } = setup(true);

    expect(actions.send("s", "hi")).toBe(false);
    expect(submitSession).not.toHaveBeenCalled();
  });

  it("passes an immediate answer through", () => {
    vi.mocked(submitSession).mockReturnValue(false);
    const { actions } = setup();

    expect(actions.send("s", "hi")).toBe(false);
  });

  it("clears the composer at once for a deferred submission and swallows its displayed failure", async () => {
    const failure = Promise.reject(new Error("moved"));
    vi.mocked(submitSession).mockReturnValue(failure);
    const { actions } = setup();

    expect(actions.send("s", "hi")).toBe(true);
    // An unhandled rejection here fails the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
