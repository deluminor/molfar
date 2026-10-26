import { describe, expect, it } from "vitest";
import { asRecord } from "./json-text";

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
