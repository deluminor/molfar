// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BoardProject, useBoardProject } from "./use-board-project";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;
let latest: BoardProject | undefined;

function Probe({ projects }: { projects: readonly string[] }): ReactNode {
  latest = useBoardProject(projects);
  return null;
}

function mount(projects: readonly string[]): void {
  root = createRoot(document.createElement("div"));
  act(() => root?.render(createElement(Probe, { projects })));
}

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  latest = undefined;
  localStorage.clear();
});

describe("useBoardProject", () => {
  it("keeps the chosen project when the board closes and opens again", () => {
    mount(["/code/app", "/code/tool"]);
    act(() => latest?.[1]("/code/tool"));
    act(() => root?.unmount());
    mount(["/code/app", "/code/tool"]);

    expect(latest?.[0]).toBe("/code/tool");
  });

  it("restores the project saved by an earlier run", () => {
    localStorage.setItem("molfar.taskBoard.project", "/code/app");
    mount(["/code/app"]);

    expect(latest?.[0]).toBe("/code/app");
  });

  it("shows All projects for a saved project that no longer exists, without forgetting it", () => {
    localStorage.setItem("molfar.taskBoard.project", "/code/removed");
    mount(["/code/app"]);

    expect(latest?.[0]).toBeNull();
    expect(localStorage.getItem("molfar.taskBoard.project")).toBe("/code/removed");
  });
});
