import { inboxAskPrompt } from "@/features/inbox/model/inbox-ask";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import {
  orchestrationPlanningPrompt,
  orchestrationRepairPrompt,
} from "@/features/orchestration/model/orchestration-plan";
import { userMessagesAfterHandoff, wrapHandoffPrompt } from "@/features/sessions/model/handoff";
import { CONTINUE_PROMPT } from "@/features/sessions/model/in-flight";
import { buildPlanPrompt, planTurnPrompt } from "@/features/sessions/model/plan";
import { preparePrompt } from "@/features/sessions/model/prompt-preparation";
import type { TurnContext } from "./turn-run";

/** The prompt for this turn's intent: a plan, a build, or an orchestration proposal. */
export async function intentPrompt({ turn, run }: TurnContext): Promise<string> {
  const { sessionId, current, intent, approvedPlan, options } = turn;
  const prompt =
    intent === "build" && approvedPlan
      ? buildPlanPrompt(approvedPlan.text)
      : await preparePrompt(turn.harnessText, {
          harness: current.harness,
          sessionId,
          cwd: run.workCwd,
        });

  const draft = run.proposalDraft;
  if (draft) {
    return options?.orchestrationRetry?.response
      ? orchestrationRepairPrompt({
          ...draft,
          error: options.orchestrationRetry.error,
          response: options.orchestrationRetry.response,
        })
      : orchestrationPlanningPrompt(prompt, draft.settings, draft.checkoutCwd ?? draft.cwd);
  }
  return intent === "plan" && !turn.rawCommand ? planTurnPrompt(prompt) : prompt;
}

/** The text sent to the harness: the inbox ask and a pending handoff recap around the prompt. */
export function harnessTurnText({ turn, setup, run }: TurnContext, prompt: string): string {
  const { sessionId, current, rawCommand } = turn;
  const earlier = setup.queuedHandoff ? userMessagesAfterHandoff(current) : [];
  const { wrap } = run;

  return orchestrator.prompt(
    sessionId,
    inboxAskPrompt(
      rawCommand ? undefined : current.inboxAsk,
      wrap && !rawCommand
        ? wrapHandoffPrompt(wrap.text, wrap.from, prompt.trim() || CONTINUE_PROMPT, earlier)
        : prompt,
    ),
  );
}
