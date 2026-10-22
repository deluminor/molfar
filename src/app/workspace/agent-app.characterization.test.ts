// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { answeredSession } from "./testing/workspace-steps";

// Pins the app CLI (molfar-control-request) before its handler leaves
// App.tsx for flows/agent-app (global refactor, Stage 5).

vi.setConfig({ testTimeout: 60_000 });

let app: AppHarness | undefined;

afterEach(async () => {
  await app?.unmount();
  app = undefined;
});

function current(): AppHarness {
  if (!app) throw new Error("App not rendered");
  return app;
}

const reply = (harness: AppHarness, id: string) =>
  harness.commands("control_reply").find((call) => call.args?.id === id)?.args;

async function request(id: string, sessionId: string, action: string, input: object, namespace = "app") {
  await current().emit("molfar-control-request", {
    id,
    namespace,
    sessionId,
    requestId: id,
    action,
    input,
  });
  await current().until(() => reply(current(), id) !== undefined);
  return reply(current(), id);
}

describe("Workspace app CLI", () => {
  it("starts a session from an /operator thread and sends its prompt", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "/operator help", "Sure.");
    const source = app.harness.turns[0]?.sessionId ?? "";

    const answer = await request("r1", source, "sessions.start", { prompt: "Write the docs" });

    expect(answer).toMatchObject({ response: { ok: true, result: { id: `app-${source}-r1`, submitted: true } } });
    await app.until(() => current().harness.turns.some((turn) => turn.text.includes("Write the docs")));
  });

  it("lists the project's sessions", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "/operator help", "Sure.");
    const source = app.harness.turns[0]?.sessionId ?? "";

    const answer = await request("r2", source, "sessions.list", {});

    expect(answer).toMatchObject({ response: { ok: true } });
    expect(JSON.stringify(answer)).toContain(source);
  });

  it("refuses an unknown namespace", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "explain", "Sure.");
    const source = app.harness.turns[0]?.sessionId ?? "";

    const answer = await request("r3", source, "sessions.list", {}, "nope");

    expect(answer).toMatchObject({ response: { ok: false, error: "Unknown CLI namespace" } });
  });
});
