import { describe, expect, it } from "vitest";
import {
  composeConfluenceMessage,
  confluenceFolderTocMarkdown,
  confluenceIdsInText,
  confluenceMentionLabel,
  injectConfluencePrompt,
  isConfluenceFolderLike,
  normalizeConfluenceKind,
  visibleConfluenceSpaces,
  type ConfluenceNode,
} from "./confluence";

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

  it("injects page bodies and folder TOC", () => {
    const injected = injectConfluencePrompt("Use this.", [
      { title: "Blueprint", body: "Hello world" },
    ]);
    expect(injected).toContain('Referenced Confluence "Blueprint":');
    expect(injected).toContain("Hello world");

    const children: ConfluenceNode[] = [
      {
        id: "1",
        title: "Child",
        kind: "page",
        spaceId: "s",
        spaceKey: "TB",
        parentId: "0",
        url: "https://example.com/1",
        hasChildren: false,
        readable: true,
      },
    ];
    const toc = confluenceFolderTocMarkdown(
      {
        title: "Technical docs",
        url: "https://example.com/folder",
        id: "0",
      },
      children,
    );
    expect(toc).toContain("Table of contents");
    expect(toc).toContain("Child");
    expect(toc).not.toContain("Hello world");
  });

  it("composes send-to-chat messages", () => {
    expect(
      composeConfluenceMessage(
        {
          kind: "page",
          id: "1",
          title: "Doc",
          url: "https://x",
          body: "Body",
        },
        "  ",
      ),
    ).toContain("Use this Confluence page.");
    expect(
      composeConfluenceMessage(
        {
          kind: "folder",
          id: "2",
          title: "Folder",
          url: "https://x",
          body: "TOC",
        },
        "Focus on architecture",
      ),
    ).toContain("Focus on architecture");
  });

  it("filters hidden spaces", () => {
    const spaces = [
      { id: "1", key: "TB", name: "Trading" },
      { id: "2", key: "ENG", name: "Engineering" },
    ];
    expect(visibleConfluenceSpaces(spaces, ["2"]).map((s) => s.key)).toEqual([
      "TB",
    ]);
  });

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
