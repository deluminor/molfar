// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

let container: HTMLDivElement;
let root: Root;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  logged.mockRestore();
  vi.unstubAllGlobals();
});

function Exploding({ fail }: { fail: () => boolean }) {
  if (fail()) throw new Error("Render blew up");
  return createElement("main", null, "Healthy content");
}

it("renders its children while they work", async () => {
  await act(async () =>
    root.render(
      createElement(ErrorBoundary, { scope: "main window", recovery: "reload" }, createElement(Exploding, { fail: () => false })),
    ),
  );

  expect(container.textContent).toBe("Healthy content");
  expect(logged).not.toHaveBeenCalled();
});

it("logs the failure with its scope and offers a reload at the root", async () => {
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });

  await act(async () =>
    root.render(
      createElement(ErrorBoundary, { scope: "main window", recovery: "reload" }, createElement(Exploding, { fail: () => true })),
    ),
  );

  expect(container.textContent).toContain("Render blew up");
  expect(logged).toHaveBeenCalledWith(
    "main window: render failed",
    expect.objectContaining({ error: expect.any(Error), componentStack: expect.any(String) }),
  );

  const button = container.querySelector("button");
  expect(button?.textContent).toBe("Reload");
  act(() => button?.click());
  expect(reload).toHaveBeenCalledOnce();
});

it("lets a surface try again without reloading the window", async () => {
  let failing = true;
  await act(async () =>
    root.render(
      createElement(ErrorBoundary, { scope: "surface", recovery: "retry" }, createElement(Exploding, { fail: () => failing })),
    ),
  );

  const button = container.querySelector("button");
  expect(button?.textContent).toBe("Try again");

  failing = false;
  await act(async () => button?.click());
  expect(container.textContent).toBe("Healthy content");
});
