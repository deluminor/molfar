import { describe, expect, it } from "vitest";
import { shouldRecheckForUpdate } from "./update-recheck";

describe("shouldRecheckForUpdate", () => {
  it("re-probes once the last check settled without an update in hand", () => {
    expect(shouldRecheckForUpdate("idle")).toBe(true);
    expect(shouldRecheckForUpdate("current")).toBe(true);
    expect(shouldRecheckForUpdate("error")).toBe(true);
  });

  it("leaves an in-flight check or a found update alone", () => {
    expect(shouldRecheckForUpdate("checking")).toBe(false);
    expect(shouldRecheckForUpdate("available")).toBe(false);
    expect(shouldRecheckForUpdate("downloading")).toBe(false);
  });
});
