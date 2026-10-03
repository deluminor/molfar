import { expect, it } from "vitest";
import { parseVaultDocument, parseVaultSnapshot } from "./parse-vault";

it("rejects malformed native responses before UI consumption", () => {
  expect(() =>
    parseVaultDocument({ path: "a.md", body: 10, revision: "r" }),
  ).toThrow("expected text");
  expect(() =>
    parseVaultSnapshot({
      connection: { id: "v", root: "/vault", name: "Vault" },
      entries: [],
      notes: [],
      warnings: [],
      truncated: "false",
    }),
  ).toThrow("boolean");
});

it("accepts a native document without discarding its raw content", () => {
  const document = {
    path: "a.md",
    body: "---\r\ncustom: value\r\n---\r\n",
    revision: "r",
  };
  expect(parseVaultDocument(document)).toEqual(document);
});
