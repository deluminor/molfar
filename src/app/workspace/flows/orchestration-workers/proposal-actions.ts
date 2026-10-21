import type { OrchestrationProposal } from "@/domain/orchestration/proposal";
import type { Session } from "@/domain/session/session";
import type { orchestrator } from "@/features/orchestration/model/orchestration";
import {
  validateOrchestrationSettings,
  withOrchestrationProposal,
} from "@/features/orchestration/model/orchestration-plan";
import type { Submit } from "../submission/submit-types";

export type ProposalActionsDeps = {
  sessionsRef: { current: Session[] };
  /** Leads whose proposal is being confirmed; a second confirm is ignored. */
  confirming: { readonly current: Set<string> };
  orchestrator: Pick<typeof orchestrator, "hydrate" | "startApproved">;
  setSessions(sessions: Session[]): void;
  saveSession(session: Session): Promise<unknown>;
  submit: Submit;
};

/** Edits, confirms and retries the orchestration proposal card in a lead's chat. */
export function createProposalActions(deps: ProposalActionsDeps) {
  const find = (leadId: string) => deps.sessionsRef.current.find((entry) => entry.id === leadId);
  const proposalOf = (session: Session | undefined, blockId: string) =>
    session?.blocks.find((block) => block.id === blockId)?.orchestration;

  const updateCard = (leadId: string, blockId: string, proposal: OrchestrationProposal): Session | undefined => {
    const next = deps.sessionsRef.current.map((session) =>
      session.id === leadId ? withOrchestrationProposal(session, blockId, proposal) : session,
    );
    deps.sessionsRef.current = next;
    deps.setSessions(next);
    return next.find((session) => session.id === leadId);
  };

  const update = (leadId: string, blockId: string, edited: OrchestrationProposal): void => {
    const session = find(leadId);
    const proposal = proposalOf(session, blockId);
    if (!session || session.busy || proposal?.status !== "ready" || deps.confirming.current.has(leadId)) return;

    // Keep the discovered catalog authoritative while allowing task and parallelism edits.
    const settings = validateOrchestrationSettings({ ...proposal.settings, maxWorkers: edited.settings.maxWorkers });
    updateCard(leadId, blockId, { ...proposal, settings, tasks: edited.tasks });
  };

  const confirm = async (leadId: string, blockId: string): Promise<void> => {
    if (deps.confirming.current.has(leadId)) return;

    deps.confirming.current.add(leadId);
    let proposal: OrchestrationProposal | undefined;
    try {
      await deps.orchestrator.hydrate(leadId);
      const session = find(leadId);
      proposal = proposalOf(session, blockId);
      if (!session || session.busy || proposal?.status !== "ready")
        throw new Error("Wait for the proposal to finish before confirming.");
      if (session.harness !== proposal.author.harness || session.model !== proposal.author.model)
        throw new Error(
          "The lead model has changed. Switch back to the model shown on this card, or generate a new proposal.",
        );

      const starting = updateCard(leadId, blockId, { ...proposal, status: "starting" });
      // Save the edited card before anything can execute.
      if (starting) await deps.saveSession(starting);
      await deps.orchestrator.startApproved(leadId, blockId, proposal);
      updateCard(leadId, blockId, { ...proposal, status: "approved" });
    } catch (error) {
      if (proposal) updateCard(leadId, blockId, { ...proposal, status: "ready" });
      throw error;
    } finally {
      deps.confirming.current.delete(leadId);
    }
  };

  const retry = (leadId: string, blockId: string): void => {
    const session = find(leadId);
    const proposal = proposalOf(session, blockId);
    if (!session || session.busy || !proposal) return;

    deps.submit(leadId, proposal.request, [], { intent: "orchestrate", orchestrationRetry: proposal });
  };

  return { update, confirm, retry };
}
