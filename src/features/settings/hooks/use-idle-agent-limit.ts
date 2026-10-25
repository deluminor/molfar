import { useState } from "react";
import { enforceHarnessIdleLimit } from "@/integrations/harness/core/registry";
import {
  type IdleAgentLimit,
  loadIdleAgentLimit,
  saveIdleAgentLimit,
} from "../model/idle-agent-limit";

/** The idle agent limit setting and its change handler. */
export function useIdleAgentLimit(): [IdleAgentLimit, (next: string) => void] {
  const [limit, setLimit] = useState<IdleAgentLimit>(loadIdleAgentLimit);

  const change = (next: string) => {
    const value = Number(next) as IdleAgentLimit;
    saveIdleAgentLimit(value);
    setLimit(value);
    // A lower limit takes effect now, not at the next finished turn.
    enforceHarnessIdleLimit();
  };

  return [limit, change];
}
