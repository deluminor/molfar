import { describe, expect, it } from "vitest";
import { buildTree } from "./build-tree";
const entries = [
  { path: "z.md", name: "z.md", isDir: false, isMarkdown: true },
  { path: "Topics", name: "Topics", isDir: true, isMarkdown: false },
  { path: "Topics/a.md", name: "a.md", isDir: false, isMarkdown: true },
  {
    path: "Topics/image.png",
    name: "image.png",
    isDir: false,
    isMarkdown: false,
  },
];
describe("vault file tree", () => {
  it("sorts directories first and includes attachments", () => {
    const tree = buildTree(entries, "");
    expect(tree.map((node) => node.entry.path)).toEqual(["Topics", "z.md"]);
    expect(tree[0].children.map((node) => node.entry.path)).toEqual([
      "Topics/a.md",
      "Topics/image.png",
    ]);
  });
  it("keeps ancestors of case-insensitive search matches", () => {
    const tree = buildTree(entries, "IMAGE");
    expect(tree).toHaveLength(1);
    expect(tree[0].entry.path).toBe("Topics");
    expect(tree[0].children.map((node) => node.entry.path)).toEqual([
      "Topics/image.png",
    ]);
  });
  it("does not create synthetic files for absent matches", () => {
    expect(buildTree(entries, "missing")).toEqual([]);
  });
});
