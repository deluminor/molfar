import { shouldGenerateSessionTitle } from "@/domain/session/generated-title";
import { canReplaceSessionTitle, formatSessionTitle } from "@/domain/session/title";
import { resolveLinkedWorkItem } from "@/features/sessions/model/session-work-item";
import { generateHarnessTitle } from "@/integrations/harness";
import type { PreparedSubmission } from "./prepared-submission";
import type { SubmissionDeps } from "./submission-deps";
import type { TurnSetup } from "./turn-setup";

/** Names a new session after its first message, and links the work item it mentions. */
export function launchTitleGeneration(
  deps: SubmissionDeps,
  turn: PreparedSubmission,
  setup: TurnSetup,
  workCwd: string,
): void {
  const { sessionId, options, current, attachments } = turn;
  const { isFirstTurn, gen, titleSeed } = setup;
  if (
    !setup.live ||
    !shouldGenerateSessionTitle(isFirstTurn, setup.placeholderTitle, options?.refreshTitle)
  ) {
    return;
  }

  const titleMessage = turn.harnessText || attachments.map((file) => file.name).join(", ");
  void generateHarnessTitle(current.harness, {
    sessionId,
    cwd: workCwd,
    message: titleMessage,
    providerAccountId: turn.providerAccountId,
  })
    .then(async (generated) => {
      if (options?.refreshTitle && !isFirstTurn && deps.turnGen.current.get(sessionId) !== gen) {
        return;
      }
      const linkedWorkItem = await resolveLinkedWorkItem(
        titleMessage,
        workCwd,
        generated?.workItem ?? null,
      );
      if (!generated && !linkedWorkItem) return;

      deps.setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          let next = s;
          if (
            generated &&
            (options?.refreshTitle || canReplaceSessionTitle(s.title, s.harness, titleSeed))
          ) {
            next = { ...next, title: formatSessionTitle(s.harness, generated.title) };
          }
          if (linkedWorkItem && !next.linkedWorkItem) next = { ...next, linkedWorkItem };
          return next;
        }),
      );
    })
    .catch(() => undefined);
}
