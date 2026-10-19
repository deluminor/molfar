import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { createFamiliarView, type FamiliarViewDeps } from "./familiar-view";

const familiars = vi.hoisted(() => ({
  sessions: new Map<string, Promise<Session | undefined>>(),
  known: ["first", "second"],
}));

vi.mock("@/features/familiars/model/familiar", () => ({
  findFamiliar: (id: string) => (familiars.known.includes(id) ? { id } : undefined),
  listFamiliars: () => familiars.known.map((id) => ({ id })),
  saveOpenFamiliar: vi.fn(),
}));

vi.mock("@/features/familiars/model/familiar-workspace", () => ({
  ensureFamiliarSession: (familiarId: string) =>
    familiars.sessions.get(familiarId) ?? Promise.resolve(undefined),
}));

function session(id: string): Session {
  return { ...testSession("claude", "/work/demo"), id };
}

function setup(open: Session[] = []) {
  const store = createWorkspaceStore(testWorkspaceState());
  const deps: FamiliarViewDeps = {
    store,
    cancelNavigation: vi.fn(),
    closeAutomations: vi.fn(),
    ensureOpenSession: async (id) => open.find((entry) => entry.id === id) ?? null,
    addSession: vi.fn(),
    focusComposer: vi.fn(),
  };

  return { store, deps, view: createFamiliarView(deps) };
}

describe("createFamiliarView", () => {
  beforeEach(() => {
    familiars.sessions.clear();
    familiars.known = ["first", "second"];
  });

  it("opens a Familiar over the workspace and closes the other surfaces", async () => {
    familiars.sessions.set("first", Promise.resolve(session("chat-1")));
    const { store, deps, view } = setup();
    store.getState().setSearchViewOpen(true);

    await view.open("first");

    expect(store.getState().familiarViewId).toBe("chat-1");
    expect(store.getState().searchViewOpen).toBe(false);
    expect(deps.cancelNavigation).toHaveBeenCalled();
    expect(deps.closeAutomations).toHaveBeenCalled();
    expect(deps.focusComposer).toHaveBeenCalledWith({ retake: true });
  });

  it("drops an open that a later close superseded", async () => {
    let resolve: (value: Session) => void = () => {};
    familiars.sessions.set("first", new Promise((done) => (resolve = done)));
    const { store, view } = setup();

    const opening = view.open("first");
    view.close();
    resolve(session("chat-1"));
    await opening;

    expect(store.getState().familiarViewId).toBeNull();
  });

  it("opens another Familiar on its list, not on what the last one showed", async () => {
    familiars.sessions.set("second", Promise.resolve(session("chat-2")));
    const { store, view } = setup();
    store.setState({ familiarViewId: "chat-1", familiarShownSession: "launched" });

    await view.open("second");

    expect(store.getState().familiarShownSession).toBeNull();
  });

  it("toggles back to the last Familiar, then closes it", async () => {
    familiars.sessions.set("first", Promise.resolve(session("chat-1")));
    familiars.sessions.set("second", Promise.resolve(session("chat-2")));
    const { store, view } = setup();
    await view.open("second");
    view.toggle(true);

    expect(store.getState().familiarViewId).toBeNull();

    view.toggle(true);
    await familiars.sessions.get("second");
    await Promise.resolve();

    expect(store.getState().familiarViewId).toBe("chat-2");
  });

  it("toggles to the first Familiar once the last one is forgotten", async () => {
    familiars.sessions.set("first", Promise.resolve(session("chat-1")));
    familiars.sessions.set("second", Promise.resolve(session("chat-2")));
    const { store, view } = setup();
    await view.open("second");
    view.close();
    view.forget("second");

    view.toggle(true);
    await familiars.sessions.get("first");
    await Promise.resolve();

    expect(store.getState().familiarViewId).toBe("chat-1");
  });

  it("does not open a Familiar when Familiars are off", () => {
    const { store, view } = setup();

    view.toggle(false);

    expect(store.getState().familiarViewId).toBeNull();
  });

  it("keeps showing a reset Familiar on its fresh conversation", () => {
    const { store, view } = setup();
    store.setState({ familiarViewId: "chat-1" });

    view.replaceSession("other", "fresh-other");
    expect(store.getState().familiarViewId).toBe("chat-1");

    view.replaceSession("chat-1", "fresh");
    expect(store.getState().familiarViewId).toBe("fresh");
  });

  it("shows a launched session over the overview, and hides it on a second open", async () => {
    const { store, view } = setup([session("launched")]);
    store.setState({ familiarViewId: "chat-1", familiarOverviewOpen: false });

    await view.showLaunchedSession("chat-1", "launched");

    expect(store.getState()).toMatchObject({
      familiarOverviewOpen: true,
      familiarOverviewTab: "sessions",
      familiarShownSession: "launched",
      familiarShownSessionFocused: true,
    });

    await view.showLaunchedSession("chat-1", "launched");

    expect(store.getState().familiarShownSession).toBeNull();
  });

  it("leaves the sessions list open when the launched session is gone", async () => {
    const { store, view } = setup();
    store.setState({ familiarViewId: "chat-1", familiarShownSession: "old" });

    await view.showLaunchedSession("chat-1", "missing");

    expect(store.getState().familiarShownSession).toBeNull();
    expect(store.getState().familiarOverviewTab).toBe("sessions");
  });

  it("ignores a launched session once its Familiar is no longer shown", async () => {
    const { store, view } = setup([session("launched")]);
    store.setState({ familiarViewId: "chat-2" });

    await view.showLaunchedSession("chat-1", "launched");

    expect(store.getState().familiarShownSession).toBeNull();
  });
});
