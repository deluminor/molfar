import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { LinkedWorkItemUpdateCard } from "@/domain/work-items/linked-activity";
import { markLinkedSessionUpdateSeen } from "@/features/inbox/model/linked-session-seen";
import { testSession } from "@/integrations/harness/core/test-session";
import { createReminderActions } from "./reminder-actions";

vi.mock("@/features/inbox/model/linked-session-seen", () => ({ markLinkedSessionUpdateSeen: vi.fn() }));

const card = { updatedAt: 7 } as LinkedWorkItemUpdateCard;

function setup(sessions: Session[], saved = true) {
  const deps = {
    sessionsRef: { current: sessions },
    upsertSession: vi.fn(async () => (saved ? {} : null)),
    dismissDueReminder: vi.fn(async () => undefined),
    updateLinkedCard: vi.fn(),
  };
  return { deps, reminders: createReminderActions(deps) };
}

describe("createReminderActions", () => {
  it("saves each open chat a reminder points at and skips ids not open", async () => {
    const session = { ...testSession("claude", "/work"), id: "a" };
    const { deps, reminders } = setup([session]);

    await reminders.ensureSaved(["a", "missing"]);

    expect(deps.upsertSession).toHaveBeenCalledTimes(1);
    expect(deps.upsertSession).toHaveBeenCalledWith(session);
  });

  it("refuses a reminder on a chat that cannot be saved yet", async () => {
    const { reminders } = setup([{ ...testSession("claude", "/work"), id: "a" }], false);

    await expect(reminders.ensureSaved(["a"])).rejects.toThrow("Send a message in this conversation");
  });

  it("dismisses the due reminder and only the linked update card the chat showed", () => {
    const { deps, reminders } = setup([
      { ...testSession("claude", "/work"), id: "a", linkedWorkItemUpdateCard: card },
    ]);

    reminders.dismissContinuedNotices("a");

    expect(deps.dismissDueReminder).toHaveBeenCalledWith("a");
    expect(markLinkedSessionUpdateSeen).toHaveBeenCalledWith("a", 7);
    const change = deps.updateLinkedCard.mock.calls[0][1];
    expect(change(card)).toBeUndefined();
    const newer = { updatedAt: 8 } as LinkedWorkItemUpdateCard;
    expect(change(newer)).toBe(newer);
  });

  it("leaves linked cards alone when the chat shows none", () => {
    const { deps, reminders } = setup([{ ...testSession("claude", "/work"), id: "a" }]);

    reminders.dismissContinuedNotices("a");

    expect(deps.dismissDueReminder).toHaveBeenCalledWith("a");
    expect(deps.updateLinkedCard).not.toHaveBeenCalled();
  });
});
