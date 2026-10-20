import { describe, expect, it, vi } from "vitest";
import { addNoteToChat } from "../notes/add-note-to-chat";
import { issue, setupInbox } from "./inbox.fixture";
import { openInboxSession, startInboxItem } from "./inbox-start";

vi.mock("@/features/inbox/model/inbox-context", () => ({
  inboxTrackerDescription: async (_item: unknown, body?: string) => body,
}));

describe("inbox entry points", () => {
  it("starts a chat on an inbox item, linked to it, and leaves the inbox", async () => {
    const { deps, store, opened } = setupInbox();

    await startInboxItem(deps, issue, "Steps to reproduce");

    expect(store.getState().inboxViewOpen).toBe(false);
    expect(deps.closeAutomations).toHaveBeenCalled();
    expect(opened[0].cwd).toBe("/work/demo");
    expect(opened[0].session).toMatchObject({
      title: "#42 Login fails",
      linkedWorkItem: { repo: "acme/app", number: 42 },
    });
    expect(opened[0].session.inboxCard).toBeDefined();
    expect(deps.focusComposer).toHaveBeenCalled();
  });

  it("starts a chat carrying a note, titled after it", () => {
    const { deps, opened } = setupInbox();

    addNoteToChat(deps, { id: "n", slug: "n", title: " Plan ", body: "Ship" });

    expect(opened[0].session).toMatchObject({ title: "Plan", noteCard: { id: "n" } });
  });

  it("ignores a note without an id", () => {
    const { deps, opened } = setupInbox();

    addNoteToChat(deps, { id: "", slug: "n", title: "Plan", body: "Ship" });

    expect(opened).toEqual([]);
  });

  it("opens a related chat in its project", () => {
    const { deps, store } = setupInbox();

    openInboxSession(deps, "s");

    expect(store.getState().inboxViewOpen).toBe(false);
    expect(deps.setSidebarTab).toHaveBeenCalledWith("sessions", "/work/demo");
    expect(deps.selectHistorySession).toHaveBeenCalledWith("s");
  });
});
