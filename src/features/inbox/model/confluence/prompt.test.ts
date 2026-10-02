import { describe, expect, it } from "vitest";
import {
  composeConfluenceMessage,
  confluenceFolderTocMarkdown,
  injectConfluencePrompt,
} from "./prompt";
import type { ConfluenceNode } from "./types";

describe("confluence prompt", () => {
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
});
