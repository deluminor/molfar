// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";

// Pins the Familiar view before its state and flows leave App.tsx (global
// refactor, Stage 5).

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

function titleTabCount(): number {
  return current().host.querySelectorAll("[data-title-tab-id]").length;
}

function visible(selector: string): boolean {
  return [...current().host.querySelectorAll(selector)].some(
    (element) => !element.closest('[aria-hidden="true"]'),
  );
}

function overviewShown(): boolean {
  return visible('[aria-label="Overview"]');
}

async function closeSettingsDialog() {
  await current().drive(() => {
    document
      .querySelector<HTMLElement>('[role="dialog"] button[aria-label="Close"]')
      ?.click();
  });
  await current().until(() => !document.querySelector('[role="dialog"]'));
}

async function toggleFamiliar() {
  await current().drive(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "i",
        code: "KeyI",
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
}

describe("Workspace Familiars", () => {
  it("opens a new Familiar over the workspace with its overview and settings", async () => {
    app = await renderApp({ project: "/work/demo" });
    expect(titleTabCount()).toBeGreaterThan(0);

    await app.click("Create familiar");
    await app.until(overviewShown);

    expect(titleTabCount()).toBe(0);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("closes the Familiar view with the shortcut and brings the same one back", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.click("Create familiar");
    await app.until(overviewShown);
    await closeSettingsDialog();

    await toggleFamiliar();
    await app.until(() => !overviewShown() && titleTabCount() > 0);
    // Shortcuts repeated within 80ms are dropped as key repeats.
    await app.settle(100);

    await toggleFamiliar();
    await app.until(() => overviewShown() && titleTabCount() === 0);
    expect(
      current().host.querySelectorAll("[data-familiar-rail] [data-selected]"),
    ).toHaveLength(1);
  });

  it("hides the overview from its close button and keeps the conversation", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.click("Create familiar");
    await app.until(overviewShown);

    await closeSettingsDialog();
    await app.click("Hide overview");
    await app.until(() => !overviewShown());

    expect(titleTabCount()).toBe(0);
  });
});
