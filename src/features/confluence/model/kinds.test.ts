import { describe, expect, it } from "vitest";
import { isConfluenceFolderLike, normalizeConfluenceKind } from "./kinds";

describe("confluence kinds", () => {
  it("classifies folder-like nodes", () => {
    expect(
      isConfluenceFolderLike({
        kind: "folder",
        readable: false,
        hasChildren: true,
      }),
    ).toBe(true);
    expect(
      isConfluenceFolderLike({
        kind: "page",
        readable: false,
        hasChildren: true,
      }),
    ).toBe(true);
    expect(
      isConfluenceFolderLike({
        kind: "page",
        readable: true,
        hasChildren: true,
      }),
    ).toBe(false);
    expect(normalizeConfluenceKind("blogpost")).toBe("blogpost");
    expect(normalizeConfluenceKind("weird")).toBe("other");
  });
});
