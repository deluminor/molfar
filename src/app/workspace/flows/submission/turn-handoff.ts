import {
  chooseHandoffBrief,
  completeHandoff,
  isPreparingHandoff,
  shouldAskOutgoingAgent,
} from "@/features/sessions/model/handoff";
import { requestOutgoingHandoff } from "@/features/sessions/model/handoff-turn";
import { forgetHarnessSession, isLiveHarness } from "@/integrations/harness";
import type { TurnContext } from "./turn-run";

/**
 * Switching harness mid-conversation: asks the outgoing agent for a recap
 * (falling back to one built from the transcript) and lets it go. False when
 * the turn was superseded meanwhile.
 */
export async function takeOverFromOutgoingHarness(context: TurnContext): Promise<boolean> {
  const { deps, turn, run } = context;
  const { sessionId, current, pendingSwitch, text } = turn;
  if (!pendingSwitch) return true;

  let agentText = "";
  if (shouldAskOutgoingAgent(current) && isLiveHarness(pendingSwitch.from)) {
    try {
      agentText = await requestOutgoingHandoff({
        harness: pendingSwitch.from,
        sessionId,
        cwd: run.workCwd,
        model: pendingSwitch.fromModel,
        modelSettings: pendingSwitch.fromSettings,
        providerAccountId: pendingSwitch.fromProviderAccountId,
        userRequest: text,
      });
    } catch {
      agentText = "";
    }
  }
  if (!context.isCurrent()) return false;

  const latest = deps.sessionsRef.current.find((s) => s.id === sessionId);
  const brief = chooseHandoffBrief(agentText, latest ?? current, text);
  await forgetHarnessSession(pendingSwitch.from, sessionId);
  if (!context.isCurrent()) return false;

  run.wrap = { from: pendingSwitch.from, to: current.harness, text: brief };
  return true;
}

/** Shows the recap the new harness was handed in place of its "preparing" card. */
export function revealHandoff({ deps, turn }: TurnContext, brief: string): void {
  deps.setSessions((prev) =>
    prev.map((s) => {
      if (s.id !== turn.sessionId || !isPreparingHandoff(s)) return s;
      return { ...completeHandoff(s, brief), busy: true };
    }),
  );
}
