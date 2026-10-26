import { describe, expect, it } from "vitest";
import { asRecord, nonBlankString, stringOrEmpty } from "./json-text";

describe("asRecord", () => {
  it.each([
    [{ a: 1 }, { a: 1 }],
    [null, null],
    [undefined, null],
    ["x", null],
    [[1], null],
  ] as const)("coerces %j", (value, expected) => {
    expect(asRecord(value)).toEqual(expected);
  });
});

describe("stringOrEmpty", () => {
  it("returns string values including whitespace-only", () => {
    const rec = { a: "x", b: "  ", c: 1 };
    expect(stringOrEmpty(rec, "a")).toBe("x");
    expect(stringOrEmpty(rec, "b")).toBe("  ");
    expect(stringOrEmpty(rec, "c")).toBe("");
  });
});

describe("nonBlankString", () => {
  it("trims and drops blank strings", () => {
    const rec = { a: " x ", b: "  ", c: 0 };
    expect(nonBlankString(rec, "a")).toBe("x");
    expect(nonBlankString(rec, "b")).toBeUndefined();
    expect(nonBlankString(null, "a")).toBeUndefined();
  });
});
