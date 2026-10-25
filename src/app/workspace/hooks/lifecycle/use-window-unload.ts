import { useEffect } from "react";
import { stopHarnessTextPrompts } from "@/integrations/harness";
import type { createBtw } from "../../flows/btw/btw-actions";

/** On unmount: aborts every side question and stops the text prompts. Runs before the unload cleanup. */
export function useWorkspaceTeardown(
  btw: Pick<ReturnType<typeof createBtw>, "abortAll">,
): void {
  useEffect(
    () => () => {
      btw.abortAll();
      void stopHarnessTextPrompts();
    },
    [btw],
  );
}
