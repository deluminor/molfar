import { expect, it } from "vitest";
import {
  prepareVaultPreview,
  vaultPreviewAssetPaths,
} from "./prepare-vault-preview";
import type { VaultEntry, VaultNote } from "../vault/types";

const notes: VaultNote[] = [
  { path: "Guide.md", title: "Guide", aliases: [], tags: [], links: [] },
];
const entries: VaultEntry[] = [
  { path: "Assets/a.png", name: "a.png", isDir: false, isMarkdown: false },
];

it("adapts note links and vetted local embeds without touching code", () => {
  const result = prepareVaultPreview(
    "[[Guide|Read]] ![[a.png]]\n`[[Guide]]`\n```md\n[[Guide]]\n```",
    notes,
    "Start.md",
    entries,
  );
  expect(result).toContain("[Read](#knowledge=Guide.md)");
  expect(result).toContain("![a.png](knowledge-asset/Assets%2Fa.png)");
  expect(result).toContain("`[[Guide]]`");
  expect(result).toContain("```md\n[[Guide]]\n```");
  expect(vaultPreviewAssetPaths(result)).toEqual(["Assets/a.png"]);
});

it("handles malformed reserved URLs and escaping paths without throwing", () => {
  expect(
    prepareVaultPreview(
      "![x](knowledge-asset/%ZZ)",
      notes,
      "Start.md",
      entries,
    ),
  ).toBe("x (invalid attachment link)");
  expect(
    vaultPreviewAssetPaths(
      "![x](knowledge-asset/%ZZ) ![y](knowledge-asset/..%2Fsecret.png)",
    ),
  ).toEqual([]);
  expect(
    prepareVaultPreview("![x](../../secret.png)", notes, "Start.md", entries),
  ).toBe("x (image unavailable)");
});

it("does not load remote images or route unsupported protocols", () => {
  expect(
    prepareVaultPreview(
      "![x](https://example.com/pixel.png) [evil](javascript:alert)",
      notes,
      "Start.md",
    ),
  ).toBe("x (image unavailable) evil (attachment link)");
});

it("resolves inline destinations that carry a title", () => {
  expect(
    prepareVaultPreview(
      "[Guide](Guide.md \"Read me\") [Angle](<Guide.md> 't')",
      notes,
      "Start.md",
    ),
  ).toBe("[Guide](#knowledge=Guide.md) [Angle](#knowledge=Guide.md)");
});

it("rewrites reference definitions so reference links navigate", () => {
  const result = prepareVaultPreview(
    [
      "[Guide][g] and [Web][w] and [Gone][x]",
      "",
      '[g]: Guide.md "Read me"',
      "  [w]: https://example.com",
      "[x]: Absent.md",
      "[y]: javascript:alert",
      "[^1]: Footnote stays",
      "```",
      "[g]: Guide.md",
      "```",
    ].join("\n"),
    notes,
    "Start.md",
  );

  expect(result.split("\n")).toEqual([
    "[Guide][g] and [Web][w] and [Gone][x]",
    "",
    "[g]: #knowledge=Guide.md",
    "  [w]: https://example.com",
    "",
    "",
    "[^1]: Footnote stays",
    "```",
    "[g]: Guide.md",
    "```",
  ]);
});
