// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubStorage(entries: [string, string][]) {
  const stored = new Map(entries);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  return stored;
}

it("turns each project's Familiar into one of its own that works on that project", async () => {
  const stored = stubStorage([
    ["molfar:project-agents", JSON.stringify({ "/code/app": "chat-1" })],
    [
      "molfar:project-agent-profiles",
      JSON.stringify({
        "/code/app": { name: "Skull", claim: "claimed" },
        "/code/site": { claim: "claimed" },
        "/code/off": { claim: "declined" },
      }),
    ],
    ["molfar:tab-group:mascots", JSON.stringify({ "/code/app": "skull" })],
  ]);
  const { isFamiliarSession, listFamiliars, familiarForSession } = await import("./familiar");

  const familiars = listFamiliars();
  expect(familiars.map((familiar) => familiar.projects)).toEqual([
    ["/code/app"],
    ["/code/site"],
  ]);
  expect(familiarForSession("chat-1")).toMatchObject({
    name: "Skull",
    mascot: "skull",
    projects: ["/code/app"],
    legacyProject: "/code/app",
  });
  expect(isFamiliarSession("chat-1")).toBe(true);
  expect(familiars[1].sessionId).toBeUndefined();
  expect(
    [...stored.keys()].filter((key) => /agent|familiars|profiles/.test(key)),
  ).toEqual([]);
});

it("migrates only once, so a deleted Familiar stays deleted", async () => {
  stubStorage([["molfar:familiars", JSON.stringify({ "/code/app": "chat-1" })]]);
  const familiar = await import("./familiar");
  const [only] = familiar.listFamiliars();
  familiar.removeFamiliar(only.id);
  vi.resetModules();
  const again = await import("./familiar");
  expect(again.listFamiliars()).toEqual([]);
});

it("renames Mono storage keys onto Familiar ones", async () => {
  const roster = [
    {
      id: "f1",
      mascot: "skull",
      color: "hsl(0 0% 50%)",
      projects: ["/code/app"],
    },
  ];
  const stored = stubStorage([
    ["molfar:mono-roster", JSON.stringify(roster)],
    ["molfar:mono-intro-dismissed", "1"],
    [
      "molfar:project-chat-backgrounds",
      JSON.stringify({ "mono:f1": { path: "/bg.png" } }),
    ],
  ]);
  const { listFamiliars, familiarIntroDismissed } = await import("./familiar");

  expect(listFamiliars()).toEqual(roster);
  expect(familiarIntroDismissed()).toBe(true);
  expect(stored.has("molfar:mono-roster")).toBe(false);
  expect(stored.get("molfar:familiar-roster")).toBe(JSON.stringify(roster));
  expect(JSON.parse(stored.get("molfar:project-chat-backgrounds")!)).toEqual({
    "familiar:f1": { path: "/bg.png" },
  });
});
