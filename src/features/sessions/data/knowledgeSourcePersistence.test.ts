import { expect, it } from "vitest";
import { newSession } from "../model/session";
import { sanitizeSessionForPersist } from "./sessionStore";

it("preserves Knowledge provenance on a persisted user turn", () => {
  const session = newSession("codex", "/repo");
  const source = {
    kind: "knowledge" as const,
    vaultName: "Research",
    path: "Projects/Plan.md",
    revision: "hash",
  };
  session.blocks = [
    {
      id: "user",
      role: "user",
      text: "Explain",
      noteCard: {
        id: "knowledge:v:Projects/Plan.md",
        slug: "Research/Projects/Plan.md",
        title: "Plan",
        source,
      },
    },
  ];
  expect(
    sanitizeSessionForPersist(session)?.blocks[0].noteCard?.source,
  ).toEqual(source);
});
