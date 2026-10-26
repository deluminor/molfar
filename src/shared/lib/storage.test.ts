import { afterEach, describe, expect, it, vi } from "vitest";
import { parseStoredJson, readJson, writeJson } from "./storage";

describe("readJson", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("parses through the validator and falls back on bad data", () => {
    writeJson("k", { n: 1 });
    expect(readJson("k", (value) => (value as { n: number }).n, 0)).toBe(1);
    writeJson("k", "not-json");
    expect(readJson("k", (value) => (value as { n: number }).n, 0)).toBe(0);
    expect(readJson("missing", (value) => value, null)).toBeNull();
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
