// @vitest-environment happy-dom
import { expect, it } from "vitest";
import type { Familiar } from "../../familiars/model/familiar";
import type { Session } from "../../sessions/model/session";
import { companionAlerts } from "./companionAlerts";

const session = (overrides: Partial<Session> & { id: string }): Session =>
  ({
    harness: "claude",
    model: "opus",
    modelSettings: {},
    runtimeMode: "supervised",
    title: "Fix CI",
    cwd: "/code/app",
    blocks: [],
    ...overrides,
  }) as Session;

const familiar: Familiar = {
  id: "fam-1",
  sessionId: "fam-session",
  name: "Vedmid",
  mascot: "ghost",
  color: "hsl(245 75% 65%)",
  projects: [],
};

it("raises one alert per pending approval and question", () => {
  const alerts = companionAlerts(
    [
      session({
        id: "fam-session",
        blocks: [
          { id: "a", role: "tool", text: "", approval: { requestId: 3 }, tool: { title: "rm -rf dist" } },
          { id: "b", role: "tool", text: "", approval: { requestId: 2, decided: "allow" } },
        ],
      }),
      session({
        id: "s1",
        pendingQuestion: {
          requestId: 9,
          questions: [{ id: "q", prompt: "Which branch?", multiSelect: false, allowCustom: true, options: [] }],
        },
      }),
      session({ id: "habit", ephemeral: true, blocks: [{ id: "c", role: "tool", text: "", approval: { requestId: 1 } }] }),
    ],
    [familiar],
  );
  expect(alerts).toEqual([
    {
      key: "fam-session:approval:3",
      title: "Vedmid needs you",
      body: "Approve rm -rf dist",
      target: { kind: "familiar", id: "fam-1" },
    },
    {
      key: "s1:question:9",
      title: "Question: Fix CI",
      body: "Which branch?",
      target: { kind: "session", id: "s1" },
    },
  ]);
});
