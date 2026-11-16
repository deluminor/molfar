// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveBoardProject, savedBoardProject, shownBoardProject, subscribeBoardProject } from "./board-project";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("board project", () => {
  it("persists the chosen project and restores it from storage", () => {
    saveBoardProject("/code/app");

    expect(localStorage.getItem("molfar.taskBoard.project")).toBe("/code/app");
    expect(savedBoardProject()).toBe("/code/app");
  });

  it("forgets the choice when All projects is picked", () => {
    saveBoardProject("/code/app");
    saveBoardProject(null);

    expect(savedBoardProject()).toBeNull();
  });

  it("tells subscribers about a new choice until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBoardProject(listener);
    saveBoardProject("/code/app");
    unsubscribe();
    saveBoardProject(null);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("logs and keeps working when storage refuses the write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    saveBoardProject("/code/app");

    expect(warn).toHaveBeenCalledWith("Could not save the Task Board project", expect.any(Error));
  });
});

describe("shownBoardProject", () => {
  const projects = ["/code/app", "C:/Code/Tool"];

  it("shows the saved project while it is on the board", () => {
    expect(shownBoardProject("/code/app/", projects)).toBe("/code/app");
    expect(shownBoardProject("c:/code/tool", projects)).toBe("C:/Code/Tool");
  });

  it("falls back to All projects when the saved project is gone", () => {
    expect(shownBoardProject("/code/removed", projects)).toBeNull();
    expect(shownBoardProject(null, projects)).toBeNull();
  });
});
