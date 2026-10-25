import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { familiarSessionCompletionResult } from "@/features/familiars/model/familiar-session-completion";
import { testSession } from "@/integrations/harness/core/test-session";
import { createFamiliarCompletions, type FamiliarCompletionsDeps } from "./familiar-completions";

vi.mock("@/features/familiars/model/familiar", () => ({
  isFamiliarSession: (id: string) => id === "familiar",
}));

function setup(options: { removing?: boolean; busy?: boolean } = {}) {
  let open: Session[] = [{ ...testSession("claude", "/work/demo"), id: "familiar" }];
  const deps: FamiliarCompletionsDeps = {
    ensureOpenSession: async (id) => open.find((entry) => entry.id === id) ?? null,
    isRemoving: () => options.removing ?? false,
    setSessions: (update) => {
      open = typeof update === "function" ? update(open) : update;
    },
    isBusyOnTurn: () => options.busy ?? false,
  };

  return { completions: createFamiliarCompletions(deps), queued: () => open[0].queuedMessages };
}

function finish(completions: ReturnType<typeof createFamiliarCompletions>) {
  completions.batches.watch({ familiarId: "familiar", turn: 1 }, "worker")(
    familiarSessionCompletionResult({
      requestId: "worker",
      sessionId: "worker",
      project: "/work/demo",
      prompt: "Fix it",
      outcome: { status: "completed", text: "Fixed" } as ControlOutcome,
    }),
  );
}

describe("createFamiliarCompletions", () => {
  it("queues a finished batch once the Familiar moves past the launching turn", async () => {
    const { completions, queued } = setup();
    finish(completions);

    completions.closeInactive();
    await vi.waitFor(() => expect(queued()).toHaveLength(1));
  });

  it("keeps the batch open while the Familiar is still on that turn", async () => {
    const { completions, queued } = setup({ busy: true });
    finish(completions);

    completions.closeInactive();
    await Promise.resolve();

    expect(queued() ?? []).toHaveLength(0);
  });

  it("drops the batch for a Familiar being removed", async () => {
    const { completions, queued } = setup({ removing: true });
    finish(completions);

    completions.closeInactive();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queued() ?? []).toHaveLength(0);
  });
});
