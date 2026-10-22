import { describe, expect, it } from "vitest";
import { visibleConfluenceSpaces } from "./hidden-spaces";

describe("confluence hidden spaces", () => {
  it("filters hidden spaces", () => {
    const spaces = [
      { id: "1", key: "TB", name: "Trading" },
      { id: "2", key: "ENG", name: "Engineering" },
    ];
    expect(visibleConfluenceSpaces(spaces, ["2"]).map((s) => s.key)).toEqual([
      "TB",
    ]);
  });
});
