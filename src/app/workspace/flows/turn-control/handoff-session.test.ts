import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/session/block";
import { testSession } from "@/integrations/harness/core/test-session";
import { handoffSession } from "./handoff-session";

const turn: Block[] = [
  { id: "ask", role: "user", text: "Fix the build" },
  { id: "reply", role: "assistant", text: "Fixed" },
];

describe("handoffSession", () => {
  it("opens the target harness in the source's checkout with a handoff card", () => {
    const source = {
      ...testSession("claude", "/work/demo"),
      id: "src",
      title: "Build fixes",
      worktreeCwd: "/work/demo-wt",
      branch: "fix/build",
      blocks: turn,
    };

    const session = handoffSession(source, { harness: "codex", model: "" }, turn);

    expect(session.id).not.toBe("src");
    expect(session).toMatchObject({
      harness: "codex",
      cwd: "/work/demo",
      worktreeCwd: "/work/demo-wt",
      branch: "fix/build",
    });
    expect(session.title).toContain("Build fixes");
    expect(session.handoffCard).toMatchObject({ from: "claude", to: "codex" });
    expect(JSON.stringify(session.handoffCard)).toContain("Fix the build");
  });
});
