// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountHook } from "../../testing/mount-hook";
import { useWorkspaceTeardown } from "./use-window-unload";

const mocks = vi.hoisted(() => ({ stopHarnessTextPrompts: vi.fn(async () => undefined) }));

vi.mock("@/integrations/harness", () => ({ stopHarnessTextPrompts: mocks.stopHarnessTextPrompts }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

describe("useWorkspaceTeardown", () => {
  it("aborts the side questions and stops text prompts only on unmount", () => {
    const btw = { abortAll: vi.fn() };
    const { rerender, unmount } = mountHook(() => useWorkspaceTeardown(btw));
    rerender();
    expect(btw.abortAll).not.toHaveBeenCalled();

    unmount();

    expect(btw.abortAll).toHaveBeenCalledTimes(1);
    expect(mocks.stopHarnessTextPrompts).toHaveBeenCalledTimes(1);
  });
});
