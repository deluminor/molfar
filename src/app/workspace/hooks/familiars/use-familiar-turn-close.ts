import { useEffect } from "react";
import type { SubmissionFlows } from "../flows/use-submission-flows";

/** Closes the Familiar turns whose chat went idle. */
export function useFamiliarTurnClose(
  familiarCompletions: SubmissionFlows["familiarCompletions"],
  sessions: readonly unknown[],
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: every session change may end a Familiar's turn.
  useEffect(() => {
    familiarCompletions.closeInactive();
  }, [sessions]);
}
