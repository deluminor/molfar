import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { type OpenSavedSessionDeps, openSavedSession } from "../session-history/open-saved-session";
import type { PaneDeps } from "./pane-deps";
import { selectHistorySession } from "./select-history-session";
import { createSessionOpenerActions } from "./session-opener-actions";
import { focusOpenSession, replaceBlankPaneWithSession, type TabFocusDeps } from "./tab-focus";

vi.mock("./tab-focus", () => ({ focusOpenSession: vi.fn(() => true), replaceBlankPaneWithSession: vi.fn(() => false) }));
vi.mock("../session-history/open-saved-session", () => ({ openSavedSession: vi.fn(async () => null) }));
vi.mock("./select-history-session", () => ({ selectHistorySession: vi.fn(async () => undefined) }));

beforeEach(() => vi.clearAllMocks());

const focus = {} as TabFocusDeps;
const saved = {} as OpenSavedSessionDeps;
const pane = {} as PaneDeps;

describe("createSessionOpenerActions", () => {
  it("focuses an open tab or replaces a blank pane through the focus deps", () => {
    const openers = createSessionOpenerActions({ focus, saved, pane });
    const session = { id: "s" } as Session;

    expect(openers.focusOpen("s")).toBe(true);
    expect(openers.replaceBlankPane(session)).toBe(false);
    expect(focusOpenSession).toHaveBeenCalledWith(focus, "s");
    expect(replaceBlankPaneWithSession).toHaveBeenCalledWith(focus, session);
  });

  it("loads saved sessions and selects history through their own deps", async () => {
    const openers = createSessionOpenerActions({ focus, saved, pane });

    await expect(openers.ensureOpen("s")).resolves.toBeNull();
    await openers.selectHistory("s");

    expect(openSavedSession).toHaveBeenCalledWith(saved, "s");
    expect(selectHistorySession).toHaveBeenCalledWith(pane, "s");
  });
});
