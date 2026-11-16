import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedWorkItem, Session } from "@/domain/session/session";
import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";
import { testSession } from "@/integrations/harness/core/test-session";
import { issue, setupInbox } from "../inbox/inbox.fixture";
import { setHistorySessionLinkedWorkItem } from "./history-link";
import { createLinkedUpdateCards } from "./linked-update-card";
import { createLinkedWorkItemPanels } from "./linked-work-item-panel";

const remote = vi.hoisted(() => ({
  thread: vi.fn<() => Promise<unknown>>(),
  link: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/features/inbox/model/github-tasks", () => ({ githubWorkItemThread: () => remote.thread() }));
vi.mock("@/features/sessions/data/session-store", () => ({ setSessionLinkedWorkItem: () => remote.link() }));
vi.mock("@/shared/lib/app-dialog", () => ({ alertApp: vi.fn(async () => undefined) }));

const linked: LinkedWorkItem = { kind: "issue", repo: "acme/app", number: 42, url: issue.url };
const linkedSession = (): Session => ({ ...testSession("claude", "/work/demo"), id: "s", linkedWorkItem: linked });
const update: LinkedSessionUpdate = { sessionId: "s", item: { ...issue, kind: "issue" }, since: 1, updatedAt: 5 };

beforeEach(() => {
  remote.thread.mockReset();
  remote.link.mockReset();
});

describe("linked update cards", () => {
  function setup() {
    const inbox = setupInbox([linkedSession()]);
    const updates = new Map([["s", update]]);
    const cards = createLinkedUpdateCards({ ...inbox.deps, linkedUpdates: () => updates });
    return { ...inbox, cards, updates };
  }

  it("shows the work item's new activity once its thread loads", async () => {
    remote.thread.mockResolvedValue({ comments: [] });
    const { cards, sessions } = setup();

    cards.reveal("s", update);

    await vi.waitFor(() => expect(sessions()[0].linkedWorkItemUpdateCard?.updatedAt).toBe(5));
    expect(sessions()[0].linkedWorkItemUpdateCard?.status).not.toBe("error");
  });

  it("drops a load the chat's activity has moved past", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    remote.thread.mockReturnValue(new Promise((done) => (resolve = done)));
    const { cards, sessions, updates } = setup();

    cards.reveal("s", update);
    updates.set("s", { ...update, updatedAt: 9 });
    resolve({ comments: [] });
    await Promise.resolve();
    await Promise.resolve();

    expect(sessions()[0].linkedWorkItemUpdateCard).toBeUndefined();
  });

  it("dismisses the card", async () => {
    remote.thread.mockResolvedValue({ comments: [] });
    const { cards, sessions } = setup();
    cards.reveal("s", update);
    await vi.waitFor(() => expect(sessions()[0].linkedWorkItemUpdateCard).toBeDefined());

    cards.dismiss("s");

    expect(sessions()[0].linkedWorkItemUpdateCard).toBeUndefined();
  });
});

describe("linked work item panels", () => {
  it("opens the panel beside the chat, and a newer request wins", async () => {
    const { deps, store } = setupInbox([linkedSession()]);
    const panels = createLinkedWorkItemPanels(deps);

    panels.open(linked, "s");
    panels.close("s");
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().linkedWorkItemPanels.size).toBe(0);

    panels.open(linked, "s");
    await vi.waitFor(() => expect(store.getState().linkedWorkItemPanels.get("s")).toMatchObject({ cwd: "/work/demo" }));
    expect(store.getState().inboxViewOpen).toBe(false);
  });
});

describe("setHistorySessionLinkedWorkItem", () => {
  function setup(session: Session) {
    const inbox = setupInbox([session]);
    const forgetLoaded = vi.fn();
    const refreshHistory = vi.fn(async () => undefined);
    return { ...inbox, forgetLoaded, refreshHistory, deps: { ...inbox.deps, forgetLoaded, refreshHistory } };
  }

  it("links the chat everywhere it shows", async () => {
    remote.link.mockResolvedValue(undefined);
    const { deps, sessions, forgetLoaded } = setup({ ...testSession("claude", "/work/demo"), id: "s" });

    setHistorySessionLinkedWorkItem(deps, "s", linked);

    expect(forgetLoaded).toHaveBeenCalledWith("s");
    expect(sessions()[0].linkedWorkItem).toBe(linked);
  });

  it("rolls the link back when it cannot be saved", async () => {
    remote.link.mockRejectedValue(new Error("offline"));
    const { deps, sessions, refreshHistory } = setup(linkedSession());

    setHistorySessionLinkedWorkItem(deps, "s", undefined);
    expect(sessions()[0].linkedWorkItem).toBeUndefined();

    await vi.waitFor(() => expect(sessions()[0].linkedWorkItem).toBe(linked));
    expect(refreshHistory).toHaveBeenCalledWith("/work/demo");
  });
});
