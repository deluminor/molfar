import type { OrchestrationProposal } from "@/domain/orchestration/proposal";
import type { NoteComposerCard } from "@/domain/notes/note-card";
import type { Attachment } from "@/domain/session/attachment";
import type { Block } from "@/domain/session/block";
import type { SecondOpinionMeta } from "@/domain/session/block-meta";
import type { HandoffComposerCard } from "@/domain/session/handoff-card";
import type { ComposerTurnOptions, PlanBuildTarget } from "@/domain/session/turn";
import type { CiRepairRequest } from "@/features/inbox/model/ci-repair";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import type { FollowUpBehavior } from "@/features/settings/model/settings";
import type { SubmissionAcceptance } from "../../../model/submission-acceptance";

export type SubmitOptions = ComposerTurnOptions & {
  ciRepair?: CiRepairRequest;
  ciContext?: string;
  secondOpinion?: SecondOpinionMeta;
  followUpBehavior?: FollowUpBehavior;
  noteCard?: NoteComposerCard;
  handoffCard?: HandoffComposerCard;
  queuedMessageId?: string;
  planBlockId?: string;
  buildTarget?: PlanBuildTarget;
  managed?: boolean;
  orchestrationRetry?: OrchestrationProposal;
  appRequestId?: string;
  /** An app request that may arrive mid-turn, steering or queuing as one typed here would. */
  followsUp?: boolean;
  familiarSessionCompletion?: Block["familiarSessionCompletion"];
  onSettled?: (outcome: ControlOutcome) => void;
  refreshTitle?: boolean;
  projectLocationReady?: boolean;
};

export type Submit = (
  sessionId: string,
  text: string,
  attachments?: Attachment[],
  options?: SubmitOptions,
) => SubmissionAcceptance;
