import type { HarnessId } from "@/domain/harness/harness";
import type {
  HarnessAdapter,
  SteerTurnInput,
  HarnessEvent,
} from "@/integrations/harness";
import type { SendTurnInput } from "@/integrations/harness/core/types";

export type FakeHarness = {
  adapter: HarnessAdapter;
  turns: SendTurnInput[];
  steers: SteerTurnInput[];
  cancelled: string[];
  approvals: Array<{ sessionId: string; requestId: number; decision: string }>;
  /** Streams events into the running turn. */
  send(event: HarnessEvent): void;
  /** Settles the running turn. */
  finish(): void;
};

/** A live harness that records turns and lets the test drive their events. */
export function createFakeHarness(id: HarnessId): FakeHarness {
  const turns: SendTurnInput[] = [];
  const steers: SteerTurnInput[] = [];
  const cancelled: string[] = [];
  const approvals: FakeHarness["approvals"] = [];
  let finishTurn: (() => void) | undefined;
  const adapter: HarnessAdapter = {
    id,
    live: true,
    sendTurn: (input) => {
      turns.push(input);
      return new Promise<void>((resolve) => {
        finishTurn = resolve;
      });
    },
    steerTurn: async (input) => {
      steers.push(input);
    },
    cancelTurn: async (sessionId) => {
      cancelled.push(sessionId);
      finishTurn?.();
    },
    respondApproval: (sessionId, requestId, decision) => {
      approvals.push({ sessionId, requestId, decision });
    },
    stopSession: async () => {},
    forgetSession: async () => {},
    bindSession: () => {},
  };

  return {
    adapter,
    turns,
    steers,
    cancelled,
    approvals,
    send(event) {
      const turn = turns[turns.length - 1];
      if (!turn) throw new Error("No running turn to send an event into");
      turn.onEvent(event);
    },
    finish() {
      finishTurn?.();
      finishTurn = undefined;
    },
  };
}
