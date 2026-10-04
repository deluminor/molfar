import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createSessionLoader, type SessionLoaderDeps } from "./session-loader";

function saved(id: string): Session {
  return { ...testSession("claude", "/work/demo"), id };
}

function deferred() {
  let resolve!: (session: Session | null) => void;
  const promise = new Promise<Session | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(overrides: Partial<SessionLoaderDeps> = {}) {
  const deps: SessionLoaderDeps = {
    cache: new Map(),
    opening: new Set(),
    get: vi.fn(async (id: string) => saved(id)),
    isRemoving: () => false,
    isOpen: () => false,
    ...overrides,
  };
  return { loader: createSessionLoader(deps), deps };
}

describe("createSessionLoader", () => {
  it("reads a session once for callers asking at the same time", async () => {
    const { loader, deps } = setup();

    const [first, second] = await Promise.all([
      loader.load("s1"),
      loader.load("s1"),
    ]);

    expect(deps.get).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(loader.loadingIds()).toEqual([]);
  });

  it("hands a cached session over and leaves the cache", async () => {
    const cachedSession = saved("s1");
    const { loader, deps } = setup({
      cache: new Map([["s1", cachedSession]]),
    });

    expect(await loader.load("s1")).toBe(cachedSession);
    expect(deps.cache.has("s1")).toBe(false);
    expect(deps.get).not.toHaveBeenCalled();
  });

  it("lands a read invalidated while it ran as null", async () => {
    const read = deferred();
    const { loader } = setup({ get: () => read.promise });

    const loading = loader.load("s1");
    loader.invalidate("s1");
    read.resolve(saved("s1"));

    expect(await loading).toBeNull();
  });

  it("lands a read for a session being removed as null", async () => {
    const { loader } = setup({ isRemoving: () => true });

    expect(await loader.load("s1")).toBeNull();
  });

  it("treats a failed read as no session", async () => {
    const { loader } = setup({
      get: async () => {
        throw new Error("store locked");
      },
    });

    expect(await loader.load("s1")).toBeNull();
  });

  it("prefetches one closed session at a time into the cache", async () => {
    const read = deferred();
    const get = vi.fn(() => read.promise);
    const { loader, deps } = setup({ get });

    loader.prefetch("s1");
    loader.prefetch("s2");
    read.resolve(saved("s1"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(get).toHaveBeenCalledTimes(1);
    expect(deps.cache.get("s1")?.id).toBe("s1");
  });

  it("does not prefetch an open session", () => {
    const { loader, deps } = setup({ isOpen: () => true });

    loader.prefetch("s1");

    expect(deps.get).not.toHaveBeenCalled();
  });

  it("forgets an opening session and its cache on invalidate", () => {
    const { loader, deps } = setup({
      cache: new Map([["s1", saved("s1")]]),
      opening: new Set(["s1"]),
    });

    loader.invalidate("s1");

    expect(deps.cache.has("s1")).toBe(false);
    expect(deps.opening.has("s1")).toBe(false);
  });
});
