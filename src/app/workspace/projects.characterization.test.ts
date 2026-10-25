// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { answeredSession, tabIds } from "./testing/workspace-steps";

// Pins opening and archiving projects before they leave App.tsx for
// flows/projects (global refactor, Stage 5).

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

function railProject(name: string): HTMLButtonElement | undefined {
  const rail = current().host.querySelector('[aria-label="Projects"]');
  return [...(rail?.querySelectorAll<HTMLButtonElement>("button[aria-label]") ?? [])].find(
    (button) => button.getAttribute("aria-label")?.startsWith(name),
  );
}

const selected = (name: string) => railProject(name)?.getAttribute("aria-current") === "true";

describe("Workspace projects", () => {
  it("opens another project from the rail in its own tab", async () => {
    app = await renderApp({ project: "/work/demo", otherProjects: ["/work/other"] });
    await answeredSession(app, "explain the build", "It uses Vite.");
    const before = tabIds(app);
    expect(selected("demo")).toBe(true);

    await app.drive(() => railProject("other")?.click());
    await app.until(() => selected("other"));

    expect(selected("demo")).toBe(false);
    expect(tabIds(app)).not.toEqual(before);
  });

  it("archiving the current project moves to the next one", async () => {
    app = await renderApp({ project: "/work/demo", otherProjects: ["/work/other"] });
    const row = railProject("demo");
    if (!row) throw new Error("No rail entry for demo");

    await app.openContextMenu(row);
    await app.chooseMenuItem("Archive");
    await app.until(() => selected("other"));

    expect(railProject("demo")).toBeUndefined();
  });
});
