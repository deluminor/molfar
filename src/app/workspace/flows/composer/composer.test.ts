import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { ComposerDeps } from "./composer-deps";
import { changeModel, changeRuntimeMode } from "./composer-model";
import { dismissComposerCard } from "./composer-cards";
import { removeDraft, saveDraft } from "./drafts";

vi.mock("@/features/sessions/data/session-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/sessions/data/session-store")>()),
  discardDraftSessionRecord: vi.fn(async () => undefined),
}));
vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  forgetHarnessSession: vi.fn(async () => undefined),
}));

function setup(patch: Partial<Session> = {}) {
  const sessionsRef = { current: [{ ...testSession("claude", "/work/demo"), id: "s", ...patch }] };
  const deps = {
    store: createWorkspaceStore(testWorkspaceState()),
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    },
    persistence: { dropPending: vi.fn(), forgetSaved: vi.fn(), forgetUserTurn: vi.fn() },
    invalidateLoadedSession: vi.fn(),
  } satisfies ComposerDeps;
  return { deps, session: () => sessionsRef.current[0] };
}

describe("composer model", () => {
  it("switches a blank session to another harness without arming a handoff", () => {
    const { deps, session } = setup();

    changeModel(deps, "s", "codex", "");

    expect(session().harness).toBe("codex");
    expect(session().pendingSwitch).toBeUndefined();
  });

  it("arms a handoff when a conversation changes harness", () => {
    const { deps, session } = setup({
      providerSessionId: "p",
      blocks: [
        { id: "u", role: "user", text: "hi" },
        { id: "a", role: "assistant", text: "hello" },
      ],
    });

    changeModel(deps, "s", "codex", "");

    expect(session().harness).toBe("codex");
    expect(session().pendingSwitch).toMatchObject({ from: "claude" });
  });

  it("changes the permission mode", () => {
    const { deps, session } = setup();

    changeRuntimeMode(deps, "s", "full-access");

    expect(session().runtimeMode).toBe("full-access");
  });
});

describe("drafts", () => {
  it("keeps an unsent message as a draft turn titled after it", () => {
    const { deps, session } = setup();

    expect(saveDraft(deps, "s", "Refactor the login form")).toBe(true);

    expect(session().blocks.at(-1)).toMatchObject({ role: "user", draft: true, text: "Refactor the login form" });
    expect(session().title).toContain("Refactor the login form");
    expect(saveDraft(deps, "s", "Another")).toBe(false);
  });

  it("refuses an empty draft and a busy session", () => {
    expect(saveDraft(setup().deps, "s", "  ")).toBe(false);
    expect(saveDraft(setup({ busy: true }).deps, "s", "text")).toBe(false);
  });

  it("forgets a session that was only its draft", () => {
    const { deps, session } = setup();
    saveDraft(deps, "s", "Draft only");
    const draftId = session().blocks.at(-1)?.id ?? "";

    expect(removeDraft(deps, "s", draftId)).toBe(true);

    expect(session().blocks).toEqual([]);
    expect(deps.persistence.forgetSaved).toHaveBeenCalledWith("s");
    expect(deps.invalidateLoadedSession).toHaveBeenCalledWith("s");
  });

  it("takes a card off the composer", () => {
    const { deps, session } = setup({ noteCard: { id: "n", slug: "n", title: "N", body: "b" } });

    dismissComposerCard(deps.setSessions, "s", "noteCard");

    expect(session().noteCard).toBeUndefined();
  });
});
