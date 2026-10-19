// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { shows } from "./testing/workspace-steps";

// Pins submitSession's branches before it leaves App.tsx for
// flows/submission (global refactor, Stage 5).

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

async function reply(text: string): Promise<void> {
  await current().drive(() => {
    const harness = current().harness;
    harness.send({ type: "message.delta", text });
    harness.send({ type: "message.completed" });
    harness.finish();
  });
}

describe("Workspace submission", () => {
  it("asks for a plan on /plan and builds the approved plan", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.submitPrompt("/plan add a dark theme");
    await app.until(() => current().harness.turns.length === 1);
    expect(app.harness.turns[0]?.text).toContain("You are in plan mode.");
    expect(app.harness.turns[0]?.text).toContain("add a dark theme");

    await reply("# Dark theme\n\n1. Add tokens");
    const build = () =>
      current().host.querySelector<HTMLButtonElement>('button[title="Build this plan"]');
    await app.until(() => !!build());
    await app.drive(() => build()?.click());
    await app.until(() => current().harness.turns.length === 2);

    expect(app.harness.turns[1]?.text).toContain("explicitly approved");
    expect(app.harness.turns[1]?.text).toContain("1. Add tokens");
  });

  it("shows the provider's failure and frees the session", async () => {
    app = await renderApp({ project: "/work/demo" });
    app.harness.adapter.sendTurn = async () => {
      throw new Error("provider exploded");
    };

    await app.submitPrompt("explain the build");
    await app.until(() => shows(current(), "provider exploded"));
    await app.until(() => !shows(current(), "Stop"));

    await app.submitPrompt("try again");
    await app.until(() => shows(current(), "try again"));
  });

  it("says a harness is not connected instead of sending", async () => {
    app = await renderApp({ project: "/work/demo" });
    app.harness.adapter.live = false;

    await app.submitPrompt("explain the build");
    await app.until(() => shows(current(), "is not connected yet"));

    expect(app.harness.turns).toEqual([]);
  });

  it("gives an /operator turn the app CLI and remembers app access", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.submitPrompt("/operator list my sessions");
    await app.until(() => current().harness.turns.length === 1);

    expect(app.harness.turns[0]).toMatchObject({ appAccess: true, controlsAgents: true });
    expect(app.harness.turns[0]?.text).toContain("list my sessions");
    expect(app.harness.turns[0]?.text).toContain("<molfar_app>");
  });
});
