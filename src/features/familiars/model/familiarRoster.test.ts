// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  addFamiliarProject,
  createFamiliar,
  findFamiliar,
  listFamiliars,
  familiarLook,
  familiarProjectsPhrase,
  familiarWorksOn,
  removeFamiliar,
  removeFamiliarProject,
  reorderFamiliars,
} from "./familiar";
import { familiarBackgroundKey, familiarChatBackground } from "./familiarBackground";
import { saveProjectChatBackgroundSettings } from "../../projects/model/projectChatBackground";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("gives each new Familiar a mascot and color the others are not using", () => {
  const first = createFamiliar();
  const second = createFamiliar();
  expect(second.mascot).not.toBe(first.mascot);
  expect(second.color).not.toBe(first.color);
  expect(familiarLook(first).name).toMatch(/^Familiar[A-Z]/);
  expect(first.projects).toEqual([]);
});

it("adds each project once and takes one away by its path", () => {
  const { id } = createFamiliar(["/code/app"]);
  addFamiliarProject(id, "/code/site");
  addFamiliarProject(id, "/code/app/");
  expect(findFamiliar(id)?.projects).toEqual(["/code/app", "/code/site"]);
  expect(familiarWorksOn(findFamiliar(id)!, "/code/site/")).toBe(true);
  removeFamiliarProject(id, "/code/app/");
  expect(findFamiliar(id)?.projects).toEqual(["/code/site"]);
});

it("keeps the rail's order and forgets a removed Familiar", () => {
  const a = createFamiliar();
  const b = createFamiliar();
  const c = createFamiliar();
  reorderFamiliars([c.id, a.id, b.id]);
  expect(listFamiliars().map((familiar) => familiar.id)).toEqual([c.id, a.id, b.id]);
  removeFamiliar(a.id);
  expect(listFamiliars().map((familiar) => familiar.id)).toEqual([c.id, b.id]);
});

it("names its projects the way a sentence would", () => {
  const project = (name: string) => ({ path: `/code/${name}`, name });
  expect(familiarProjectsPhrase([])).toBe("");
  expect(familiarProjectsPhrase([project("app")])).toBe("app");
  expect(
    familiarProjectsPhrase([project("app"), project("site"), project("api")]),
  ).toBe("app, site and api");
});

it("forgets its background along with the Familiar", () => {
  const familiar = createFamiliar();
  saveProjectChatBackgroundSettings(familiarBackgroundKey(familiar.id), {
    path: "/bg/familiar.png",
    emptyOpacity: 0.24,
    sessionOpacity: 0.24,
    scope: "all",
    effect: "gradient-blur",
  });
  expect(familiarChatBackground(familiar.id)?.path).toBe("/bg/familiar.png");
  removeFamiliar(familiar.id);
  expect(familiarChatBackground(familiar.id)).toBeNull();
});
