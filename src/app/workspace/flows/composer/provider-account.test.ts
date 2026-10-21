import { describe, expect, it, vi } from "vitest";
import type { Block, Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createProviderAccountActions, type ProviderAccountDeps, selectProviderAccount } from "./provider-account";

const turn: Block[] = [{ id: "ask", role: "user", text: "Fix the build" }];

function setup(patch: Partial<Session>) {
  let sessions: Session[] = [{ ...testSession("claude", "/work/demo"), id: "s", ...patch }];
  const deps = {
    sessions: () => sessions,
    updateSessions: vi.fn((update: (current: Session[]) => Session[]) => {
      sessions = update(sessions);
    }),
    continueLimited: vi.fn(),
    appendTab: vi.fn(),
    setActiveTabId: vi.fn(),
    setComposerFocused: vi.fn(),
  } satisfies ProviderAccountDeps;
  return { deps, sessions: () => sessions };
}

describe("selectProviderAccount", () => {
  it("ignores another provider's account and a missing session", () => {
    const { deps } = setup({});

    selectProviderAccount(deps, "s", "codex", "work");
    selectProviderAccount(deps, "missing", "claude", "work");

    expect(deps.updateSessions).not.toHaveBeenCalled();
    expect(deps.appendTab).not.toHaveBeenCalled();
  });

  it("continues a usage-limited session in place", () => {
    const { deps } = setup({ usageLimit: {}, blocks: turn });

    selectProviderAccount(deps, "s", "claude", "work");

    expect(deps.continueLimited).toHaveBeenCalledWith("s", "work");
    expect(deps.appendTab).not.toHaveBeenCalled();
  });

  it("re-pins a blank session to the account", () => {
    const { deps, sessions } = setup({});

    selectProviderAccount(deps, "s", "claude", "work");

    expect(sessions()).toHaveLength(1);
    expect(sessions()[0].providerAccountId).toBe("work");
  });

  it("opens a clean session for a new account when the conversation has started", () => {
    const { deps, sessions } = setup({ blocks: turn });

    selectProviderAccount(deps, "s", "claude", "work");

    const created = sessions()[1];
    expect(created.providerAccountId).toBe("work");
    expect(created.cwd).toBe("/work/demo");
    expect(sessions()[0].providerAccountId).toBeUndefined();
    expect(deps.appendTab).toHaveBeenCalledWith(expect.objectContaining({ focusedId: created.id }), "/work/demo");
    expect(deps.setActiveTabId).toHaveBeenCalledOnce();
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("does nothing when the started conversation already uses the account", () => {
    const { deps } = setup({ blocks: turn, providerAccountId: "work" });

    selectProviderAccount(deps, "s", "claude", "work");

    expect(deps.updateSessions).not.toHaveBeenCalled();
    expect(deps.appendTab).not.toHaveBeenCalled();
  });
});

describe("createProviderAccountActions", () => {
  it("selects for the session focused at call time", () => {
    const { deps } = setup({ usageLimit: {}, blocks: turn });
    let active: string | undefined;
    const accounts = createProviderAccountActions({ ...deps, activeSessionId: () => active });

    accounts.select("claude", "work");
    expect(deps.continueLimited).not.toHaveBeenCalled();

    active = "s";
    accounts.select("claude", "work");
    expect(deps.continueLimited).toHaveBeenCalledWith("s", "work");
  });
});
