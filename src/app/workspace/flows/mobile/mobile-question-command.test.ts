import { beforeEach, expect, it, vi } from "vitest";
import { newSession } from "@/features/sessions/model/session";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionActions } from "@/features/connections/model/remote-session-actions";
import { answerMobileQuestion } from "./mobile-question-command";

vi.mock("@/features/connections/model/remote-projects", () => ({
  remoteProjectFor: vi.fn(),
}));
vi.mock("@/features/connections/model/remote-session-actions", () => ({
  remoteSessionActions: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

function fixture() {
  const session = newSession("claude", "/repo");
  session.pendingQuestion = {
    requestId: 7,
    questions: [
      {
        id: "q",
        prompt: "Choose",
        options: [{ id: "yes", label: "Yes" }],
        multiSelect: false,
        allowCustom: false,
      },
    ],
  };
  const deps = {
    sessionsRef: { current: [session] },
    answer: vi.fn(),
    keepQuestionOpen: vi.fn(),
  };
  return { session, deps };
}

it("answers the current question through the workspace action", () => {
  const { session, deps } = fixture();
  const reply = { kind: "answered", answers: { q: ["yes"] } };
  expect(
    answerMobileQuestion(deps, session, "session.answerQuestion", {
      requestId: 7,
      reply,
    }),
  ).toEqual({ sessionId: session.id });
  expect(deps.answer).toHaveBeenCalledWith(session.id, 7, reply);
});

it("keeps the current question open without answering it", () => {
  const { session, deps } = fixture();
  answerMobileQuestion(deps, session, "session.keepQuestionOpen", {
    requestId: 7,
  });
  expect(deps.keepQuestionOpen).toHaveBeenCalledWith(session.id, 7);
  expect(deps.answer).not.toHaveBeenCalled();
});

it("rejects a stale request and malformed answers", () => {
  const { session, deps } = fixture();
  expect(() =>
    answerMobileQuestion(deps, session, "session.answerQuestion", {
      requestId: 6,
    }),
  ).toThrow("already answered");
  expect(() =>
    answerMobileQuestion(deps, session, "session.answerQuestion", {
      requestId: 7,
      reply: { kind: "answered", answers: { q: ["unknown"] } },
    }),
  ).toThrow("Choose an answer");
  expect(deps.answer).not.toHaveBeenCalled();
});

it("rejects a removed session before dispatching a reply", () => {
  const { session, deps } = fixture();
  session.worktreeRemoved = true;
  expect(() =>
    answerMobileQuestion(deps, session, "session.keepQuestionOpen", {
      requestId: 7,
    }),
  ).toThrow("no longer available");
  expect(deps.keepQuestionOpen).not.toHaveBeenCalled();
});

it("requires an open remote tab before dispatching an answer", () => {
  const { session, deps } = fixture();
  vi.mocked(remoteProjectFor).mockReturnValue({
    key: "remote://host/repo",
    environmentId: "host",
    projectId: "project",
    cwd: "/repo",
  });
  vi.mocked(remoteSessionActions).mockReturnValue(undefined);
  expect(() =>
    answerMobileQuestion(deps, session, "session.answerQuestion", {
      requestId: 7,
      reply: { kind: "skipped" },
    }),
  ).toThrow("Open this session on the desktop");
  expect(deps.answer).not.toHaveBeenCalled();
});
