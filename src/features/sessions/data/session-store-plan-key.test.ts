import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import { planTurnKey } from "@/domain/session/plan";
import {
  appendUser,
  applyHarnessEvent,
} from "@/integrations/harness/core/apply";
import { newSession } from "../model/session";
import { sanitizeSessionForPersist } from "./session-store";

describe("plan keys across a restart", () => {
  it("does not adopt a saved plan block when the turn counter starts over", () => {
    // First run of the app: this is the session's first turn, so gen is 1.
    let session = appendUser(
      newSession("claude", "/repo"),
      "plan the refactor",
    );
    session = applyHarnessEvent(session, {
      type: "plan",
      key: planTurnKey(1),
      text: "# Old plan",
    });

    // The key is saved with the transcript, so it survives the restart.
    const saved = sanitizeSessionForPersist(session);
    expect(saved.blocks.find((block) => block.role === "plan")?.plan?.key).toBe(
      session.blocks.find((block) => block.role === "plan")?.plan?.key,
    );

    // Second run: the counter is back to 1 and the user plans again.
    let reopened: Session = { ...session, blocks: saved.blocks };
    reopened = appendUser(reopened, "plan the follow-up");
    reopened = applyHarnessEvent(reopened, {
      type: "plan",
      key: planTurnKey(1),
      text: "# New plan",
    });

    const plans = reopened.blocks.filter((block) => block.role === "plan");
    expect(plans.map((block) => block.text)).toEqual([
      "# Old plan",
      "# New plan",
    ]);
    // The new plan belongs to the turn that produced it, not to the old one.
    expect(reopened.blocks.at(-1)?.text).toBe("# New plan");
  });
});
