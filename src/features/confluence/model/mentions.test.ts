import { describe, expect, it } from "vitest";
import { confluenceIdsInText, confluenceMentionLabel } from "./mentions";

describe("confluence mentions", () => {
  it("collects page and folder ids from text", () => {
    expect(
      confluenceIdsInText(
        "See @confluence/page/99 and @confluence/folder/12 plus @confluence/page/99 again.",
      ),
    ).toEqual({ pages: ["99"], folders: ["12"] });
  });

  it("builds mention labels", () => {
    expect(
      confluenceMentionLabel({
        kind: "page",
        id: "42",
        title: "Blueprint",
        url: "https://example.com",
      }),
    ).toBe("@confluence/page/42");
  });
});
