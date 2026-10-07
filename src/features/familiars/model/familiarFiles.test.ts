// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { createFamiliar, findFamiliar, HANDED_KEY, updateFamiliar } from "./familiar";
import {
  defaultSoul,
  loadFamiliarFiles,
  MEMORY_MAX_LINES,
  memoryWithinBudget,
  planAgentContext,
  familiarContext,
  familiarTurn,
  recordAgentContext,
  resetFamiliarDefaults,
} from "./familiarFiles";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  invoke.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const files = (soulHash = "s1", memoryHash = "m1") => ({
  id: "agent",
  dir: "/data/agents/agent",
  soul: "# Soul\n\nBe brief.",
  soulHash,
  memory: "- 2026-10-04 · releases are tag-triggered",
  memoryHash,
  memoryPath: "/data/agents/agent/MEMORY.md",
  topics: ["releases"],
});

it("hands a new native session everything, then nothing it already has", () => {
  expect(planAgentContext("chat", undefined, files())).toEqual({
    soul: true,
    memory: true,
  });
  // The first turn is recorded before its reply names the provider session.
  recordAgentContext("chat", undefined, files());
  expect(planAgentContext("chat", "native-1", files())).toEqual({
    soul: false,
    memory: false,
  });
  recordAgentContext("chat", "native-1", files());
  expect(planAgentContext("chat", "native-1", files())).toEqual({
    soul: false,
    memory: false,
  });
});

it("resends memory when it changed, and everything for a new session", () => {
  recordAgentContext("chat", "native-1", files());
  expect(planAgentContext("chat", "native-1", files("s1", "m2"))).toEqual({
    soul: false,
    memory: true,
  });
  expect(planAgentContext("chat", "native-1", files("s2", "m1"))).toEqual({
    soul: true,
    memory: true,
  });
  // A model switch or a rotated session starts a different native session.
  expect(planAgentContext("chat", "native-2", files())).toEqual({
    soul: true,
    memory: true,
  });
});

it("refreshes standing rules in an existing conversation after a context upgrade", () => {
  localStorage.setItem(
    HANDED_KEY,
    JSON.stringify({
      chat: { provider: "native-1", soulHash: "s1:v6", memoryHash: "m1" },
    }),
  );
  expect(planAgentContext("chat", "native-1", files())).toEqual({
    soul: true,
    memory: true,
  });
  recordAgentContext("chat", "native-1", files());
  expect(planAgentContext("chat", "native-1", files())).toEqual({
    soul: false,
    memory: false,
  });
});

it("loads only whole lines within the memory budget", () => {
  const memory = Array.from(
    { length: MEMORY_MAX_LINES + 5 },
    (_, i) => `- fact ${i}`,
  ).join("\n");
  const budget = memoryWithinBudget(memory);
  expect(budget.lines).toBe(MEMORY_MAX_LINES + 5);
  expect(budget.droppedLines).toBe(5);
  expect(budget.text.split("\n")).toHaveLength(MEMORY_MAX_LINES);
  expect(memoryWithinBudget("").lines).toBe(0);
});

it("says how to keep memory and update the soul only at the user's request", () => {
  const look = {
    name: "Skull",
    mascot: "skull",
    color: "#fff",
    projects: [
      { path: "/code/molfar", name: "molfar" },
      { path: "/code/site", name: "site" },
    ],
  };
  const full = familiarContext(look, files(), { soul: true, memory: true });
  expect(full).toContain("You are Skull, a Familiar in MOLFAR");
  expect(full).toContain("these 2 projects (molfar and site)");
  expect(full).toContain("- site: /code/site");
  expect(full).toContain("Be brief.");
  expect(full).toContain(
    "Only when the user asks you to change your soul or standing instructions",
  );
  expect(full).toContain("app soul.read {}");
  expect(full).toContain(
    'app soul.update {"text":"<complete updated Markdown>","expectedHash":"<hash from soul.read>"}',
  );
  expect(full).toContain("preserving the other instructions");
  expect(full).toContain(
    "Never change your soul on your own or edit its files directly",
  );
  expect(full).not.toContain("never edit that file yourself");
  expect(full).toContain("app memory.add");
  expect(full).toContain('"notifyOnComplete":true');
  expect(full).toContain(
    "Submitted sessions notify you on completion by default",
  );
  expect(full).toContain('set "notifyOnComplete":false on sessions.start');
  expect(full).toContain("waits for every session in that group to stop");
  expect(full).toContain("give one consolidated report");
  expect(full).toContain(
    "Sessions launched during later turns form separate groups",
  );
  expect(full).toContain(
    "Topic notes, read on demand with memory.read: releases",
  );
  expect(full).toContain("releases are tag-triggered");
  const memoryOnly = familiarContext(look, files(), {
    soul: false,
    memory: true,
  });
  expect(memoryOnly).not.toContain("<soul>");
  expect(memoryOnly).toContain("<memory>");
  const alone = familiarContext({ ...look, projects: [] }, files(), {
    soul: true,
    memory: false,
  });
  expect(alone).toContain("has not given you any projects yet");
});

it("seeds SOUL.md once, moving the old instructions into it", async () => {
  const { id } = createFamiliar(["/code/app"]);
  updateFamiliar(id, (familiar) => ({ ...familiar, instructions: "Ship on Fridays" }));
  invoke.mockImplementation(async (command: string) =>
    command === "familiar_load" ? { ...files("empty"), soul: null } : "seeded",
  );
  const [first, second] = await Promise.all([
    loadFamiliarFiles(id),
    loadFamiliarFiles(id),
  ]);
  expect(first).toBe(second);
  expect(first.soul).toBe(defaultSoul("Ship on Fridays"));
  expect(first.soulHash).toBe("seeded");
  const saves = invoke.mock.calls.filter(
    ([command]) => command === "familiar_save",
  );
  expect(saves).toHaveLength(1);
  expect(saves[0][1]).toMatchObject({
    familiar: id,
    path: "SOUL.md",
    expectedHash: "empty",
  });
  expect(findFamiliar(id)?.instructions).toBeUndefined();
});

it("resets a Familiar to the default soul and name, over the soul it loaded", async () => {
  const { id } = createFamiliar();
  updateFamiliar(id, (familiar) => ({ ...familiar, name: "Broski" }));
  invoke.mockImplementation(async (command: string) =>
    command === "familiar_load"
      ? { ...files("mine"), soul: "# Soul\n\nBe a pirate." }
      : "reset",
  );
  await resetFamiliarDefaults(id);
  const saves = invoke.mock.calls.filter(
    ([command]) => command === "familiar_save",
  );
  expect(saves).toHaveLength(1);
  expect(saves[0][1]).toMatchObject({
    path: "SOUL.md",
    text: defaultSoul(),
    expectedHash: "mine",
  });
  expect(findFamiliar(id)?.name).toBeUndefined();
});

it("reads a migrated Familiar's old project folder once, then its own", async () => {
  const { id } = createFamiliar(["/code/app"]);
  updateFamiliar(id, (familiar) => ({ ...familiar, legacyProject: "/code/app" }));
  invoke.mockImplementation(async () => ({ ...files(), soul: "# Soul" }));
  await loadFamiliarFiles(id);
  expect(invoke.mock.calls[0]).toEqual([
    "familiar_load",
    { familiar: id, legacyProject: "/code/app" },
  ]);
  expect(findFamiliar(id)?.legacyProject).toBeUndefined();
  await loadFamiliarFiles(id);
  expect(invoke.mock.calls[1]).toEqual([
    "familiar_load",
    { familiar: id, legacyProject: null },
  ]);
});

it("puts what the app adds ahead of the user's message, marked as its own", () => {
  expect(familiarTurn("what is this", [])).toBe("what is this");
  const turn = familiarTurn("what is this", ["<familiar>\nYou are Cat.\n</familiar>"]);
  expect(turn.startsWith("<molfar_context>")).toBe(true);
  expect(turn).toContain("they did not write it");
  expect(turn.indexOf("You are Cat.")).toBeLessThan(
    turn.indexOf("what is this"),
  );
  expect(turn.endsWith("</molfar_context>\n\nwhat is this")).toBe(true);
});
