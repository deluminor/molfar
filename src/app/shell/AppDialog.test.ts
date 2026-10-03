// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertApp, confirmApp } from "../model/appDialog";
import { AppDialog } from "./AppDialog";

let container: HTMLDivElement;
let root: Root;

function buttonNamed(label: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`No button labelled ${label}`);
  return button;
}

function pressEscape(): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(AppDialog)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AppDialog", () => {
  it("shows an alert with OK focused and resolves on click", async () => {
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = alertApp("Something failed", { kind: "error" });
    });

    expect(document.body.textContent).toContain("Something failed");
    expect(document.activeElement).toBe(buttonNamed("OK"));

    act(() => buttonNamed("OK").click());

    await expect(pending).resolves.toBeUndefined();
    expect(document.body.textContent).not.toContain("Something failed");
  });

  it("resolves a confirm with the chosen action", async () => {
    let accepted: Promise<boolean> = Promise.resolve(false);
    act(() => {
      accepted = confirmApp("Delete it?", { okLabel: "Delete" });
    });

    act(() => buttonNamed("Delete").click());
    await expect(accepted).resolves.toBe(true);

    let cancelled: Promise<boolean> = Promise.resolve(true);
    act(() => {
      cancelled = confirmApp("Delete it?", { okLabel: "Delete" });
    });

    act(() => buttonNamed("Cancel").click());
    await expect(cancelled).resolves.toBe(false);
  });

  it("cancels a confirm on Escape", async () => {
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => {
      pending = confirmApp("Discard changes?");
    });

    pressEscape();

    await expect(pending).resolves.toBe(false);
  });

  it("remounts identical queued dialogs so each one takes focus", async () => {
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = confirmApp("Close terminal?");
      second = confirmApp("Close terminal?");
    });

    const firstOk = buttonNamed("OK");
    act(() => firstOk.click());
    await expect(first).resolves.toBe(true);

    const secondOk = buttonNamed("OK");
    expect(secondOk).not.toBe(firstOk);
    expect(document.activeElement).toBe(secondOk);

    act(() => secondOk.click());
    await expect(second).resolves.toBe(true);
  });
});
