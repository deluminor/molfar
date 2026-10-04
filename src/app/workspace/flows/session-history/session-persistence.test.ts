import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { testSession } from "@/integrations/harness/core/test-session";
import { createSessionPersistence } from "./session-persistence";

function withUserTurn(session: Session, text = "hello", id = "u1"): Session {
  return {
    ...session,
    blocks: [...session.blocks, { id, role: "user", text }],
  };
}

function project(id = "s1"): Session {
  return { ...testSession("claude", "/work/demo"), id };
}

function setup(options: { blocked?: Set<string>; fail?: boolean } = {}) {
  const written: Session[] = [];
  const saved: SessionSummary[] = [];
  const persistence = createSessionPersistence({
    upsert: async (session) => {
      if (options.fail) throw new Error("store locked");
      written.push(session);
      return {
        id: session.id,
        cwd: session.cwd,
        harness: session.harness,
        model: session.model,
        runtimeMode: session.runtimeMode,
        title: session.title,
        createdAt: 1,
        updatedAt: 1,
      };
    },
    isBlocked: (id) => options.blocked?.has(id) ?? false,
    onSaved: (summary) => saved.push(summary),
  });
  return { persistence, written, saved };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createSessionPersistence", () => {
  it("writes a session once and skips it while nothing changed", async () => {
    const { persistence, written, saved } = setup();
    const session = withUserTurn(project());

    persistence.persist(session);
    await flush();
    persistence.persist(session);
    await flush();

    expect(written).toHaveLength(1);
    expect(saved.map((summary) => summary.id)).toEqual(["s1"]);
  });

  it("never writes a session outside a project or a blocked one", async () => {
    const { persistence, written } = setup({ blocked: new Set(["s2"]) });

    persistence.persist(withUserTurn({ ...project(), cwd: "~" }));
    persistence.persist(withUserTurn(project("s2")));
    await flush();

    expect(written).toEqual([]);
  });

  it("writes a new user turn at once and the settled session later", async () => {
    const { persistence, written } = setup();
    const busy = { ...withUserTurn(project()), busy: true };

    const waiting = persistence.observe([busy], new Set(["s1"]));
    await flush();
    expect(written).toHaveLength(1);
    expect(waiting).toBe(true);

    const answered: Session = {
      ...busy,
      busy: false,
      blocks: [...busy.blocks, { id: "a1", role: "assistant", text: "Hi." }],
    };
    expect(persistence.observe([answered], new Set(["s1"]))).toBe(true);
    await persistence.writePending();

    expect(written.map((session) => session.blocks.length)).toEqual([1, 2]);
  });

  it("does not queue a busy, visible session that was already saved", async () => {
    const { persistence } = setup();
    const busy = { ...withUserTurn(project()), busy: true };
    persistence.observe([busy], new Set(["s1"]));
    await persistence.writePending();

    const streaming: Session = {
      ...busy,
      blocks: [...busy.blocks, { id: "a1", role: "assistant", text: "…" }],
    };

    expect(persistence.observe([streaming], new Set(["s1"]))).toBe(false);
  });

  it("queues a busy session that is parked out of every tab", async () => {
    const { persistence } = setup();
    const busy = { ...withUserTurn(project()), busy: true };
    persistence.observe([busy], new Set(["s1"]));
    await persistence.writePending();

    const streaming: Session = {
      ...busy,
      blocks: [...busy.blocks, { id: "a1", role: "assistant", text: "…" }],
    };

    expect(persistence.observe([streaming], new Set())).toBe(true);
  });

  it("does not rewrite a session that arrived saved", async () => {
    const { persistence, written } = setup();
    const imported = withUserTurn(project());
    persistence.markImported(imported);

    expect(persistence.observe([imported], new Set(["s1"]))).toBe(false);
    await persistence.writePending();

    expect(written).toEqual([]);
  });

  it("drops a pending write for a session that closed", async () => {
    const { persistence, written } = setup();
    const busy = { ...withUserTurn(project()), busy: true };
    persistence.observe([busy], new Set());
    await flush();
    written.length = 0;

    expect(persistence.observe([], new Set())).toBe(false);
    await persistence.writePending();

    expect(written).toEqual([]);
  });

  it("writes pending sessions as rewritten by mapPending", async () => {
    const { persistence, written } = setup();
    const session = withUserTurn(project());
    persistence.observe([session], new Set(["s1"]));
    await flush();
    written.length = 0;
    persistence.forgetSaved("s1");

    persistence.mapPending((pending) => ({ ...pending, cwd: "/work/moved" }));
    await persistence.writePending();

    expect(written.map((entry) => entry.cwd)).toEqual(["/work/moved"]);
  });

  it("keeps a session unsaved when the write fails, so it is retried", async () => {
    const failing = setup({ fail: true });
    const session = withUserTurn(project());

    failing.persistence.persist(session);
    await flush();
    failing.persistence.persist(session);
    await flush();

    expect(failing.saved).toEqual([]);
  });

  it("forgets the saved fingerprint so an unchanged session writes again", async () => {
    const { persistence, written } = setup();
    const session = withUserTurn(project());
    persistence.persist(session);
    await flush();

    persistence.forgetSaved("s1");
    persistence.persist(session);
    await flush();

    expect(written).toHaveLength(2);
  });

  it("treats a session marked saved as written", async () => {
    const { persistence, written } = setup();
    const session = withUserTurn(project());

    persistence.markSaved(session);
    persistence.persist(session);
    await flush();

    expect(written).toEqual([]);
  });
});
