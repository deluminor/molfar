import { expect, it } from "vitest";
import { graphFocus } from "./graph-focus";

const links = [
  { source: "A.md", target: "B.md" },
  { source: "C.md", target: "A.md" },
  { source: "B.md", target: "D.md" },
];

it("focuses the selected note and its direct connections in both directions", () => {
  expect([...(graphFocus(links, "A.md") ?? [])].sort()).toEqual([
    "A.md",
    "B.md",
    "C.md",
  ]);
});

it("returns no focus without a selection and only the note when isolated", () => {
  expect(graphFocus(links, null)).toBeNull();
  expect([...(graphFocus(links, "E.md") ?? [])]).toEqual(["E.md"]);
});
