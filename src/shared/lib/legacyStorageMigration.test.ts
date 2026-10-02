// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import {
  legacyStorageTarget,
  migrateLegacyStorage,
} from "./legacyStorageMigration";

afterEach(() => {
  localStorage.clear();
});

describe("legacyStorageTarget", () => {
  it.each([
    ["monocode.themeHue", "vatra.themeHue"],
    ["monocode:tab-group:labels", "vatra:tab-group:labels"],
    ['monocode.remote-command.v1:["/p","env"]:', 'vatra.remote-command.v1:["/p","env"]:'],
  ])("maps %s", (legacy, current) => {
    expect(legacyStorageTarget(legacy)).toBe(current);
  });

  it.each(["vatra.themeHue", "monocodeX", "other.monocode.key", "monocode"])(
    "ignores %s",
    (key) => {
      expect(legacyStorageTarget(key)).toBeNull();
    },
  );
});

describe("migrateLegacyStorage", () => {
  it("copies legacy keys and keeps the originals", () => {
    localStorage.setItem("monocode.themeHue", "120");
    localStorage.setItem("monocode:tab-group:colors", '{"a":"red"}');
    localStorage.setItem("unrelated", "x");

    expect(migrateLegacyStorage(localStorage)).toBe(2);

    expect(localStorage.getItem("vatra.themeHue")).toBe("120");
    expect(localStorage.getItem("vatra:tab-group:colors")).toBe('{"a":"red"}');
    expect(localStorage.getItem("monocode.themeHue")).toBe("120");
    expect(localStorage.getItem("unrelated")).toBe("x");
  });

  it("never overwrites a value already saved under the new name", () => {
    localStorage.setItem("monocode.colorScheme", "light");
    localStorage.setItem("vatra.colorScheme", "dark");

    migrateLegacyStorage(localStorage);

    expect(localStorage.getItem("vatra.colorScheme")).toBe("dark");
  });

  it("runs once so a deliberately removed key stays removed", () => {
    localStorage.setItem("monocode.lastModel", "opus");
    migrateLegacyStorage(localStorage);
    localStorage.removeItem("vatra.lastModel");

    expect(migrateLegacyStorage(localStorage)).toBe(0);
    expect(localStorage.getItem("vatra.lastModel")).toBeNull();
  });

  it("behaves the same in the inline copy index.html runs before modules", () => {
    const html = readFileSync("index.html", "utf8");
    const script = html.match(
      /<script id="legacy-storage-migration">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(script).toBeDefined();

    localStorage.setItem("monocode.themeHue", "120");
    localStorage.setItem("monocode.colorScheme", "light");
    localStorage.setItem("vatra.colorScheme", "dark");
    runInNewContext(script ?? "", { localStorage });

    expect(localStorage.getItem("vatra.themeHue")).toBe("120");
    expect(localStorage.getItem("vatra.colorScheme")).toBe("dark");
    expect(localStorage.getItem("monocode.themeHue")).toBe("120");
    expect(migrateLegacyStorage(localStorage)).toBe(0);
  });
});
