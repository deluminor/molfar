import { afterEach, describe, expect, it } from "vitest";
import { parseStoredJson, readJson, writeJson } from "./storage";

function memoryStorage(): Storage {
  const memory = new Map<string, string>();
  return {
    get length() {
      return memory.size;
    },
    clear: () => memory.clear(),
    getItem: (key) => memory.get(key) ?? null,
    key: (index) => [...memory.keys()][index] ?? null,
    removeItem: (key) => {
      memory.delete(key);
    },
    setItem: (key, value) => {
      memory.set(key, value);
    },
  };
}

describe("readJson", () => {
  let storage: Storage;

  afterEach(() => {
    storage.clear();
  });

  it("parses through the validator and falls back on bad data", () => {
    storage = memoryStorage();
    writeJson("k", { n: 1 }, storage);
    expect(readJson("k", (value) => (value as { n: number }).n, 0, storage)).toBe(
      1,
    );
    storage.setItem("k", "not-json");
    expect(readJson("k", (value) => (value as { n: number }).n, 0, storage)).toBe(
      0,
    );
    expect(readJson("missing", (value) => value, null, storage)).toBeNull();
  });
});

describe("parseStoredJson", () => {
  it("returns fallback when JSON is invalid", () => {
    expect(parseStoredJson("{", (value) => value, "fb")).toBe("fb");
    expect(parseStoredJson('{"a":1}', (value) => (value as { a: number }).a, 0)).toBe(
      1,
    );
  });
});
