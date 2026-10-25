import { useEffect } from "react";
import { claimDueAutomations } from "@/features/automations/model/automations";
import type { AutomationRuns } from "../flows/automations/automation-runs";

/** Claims and launches due automations every 30 seconds and when the window shows again. */
export function useAutomationSchedule(runs: AutomationRuns): void {
  useEffect(() => {
    let disposed = false;
    let evaluating = false;
    const evaluate = async () => {
      if (disposed || evaluating) return;
      evaluating = true;
      try {
        await runs.ensureRecovery();
        const due = await claimDueAutomations();
        for (const item of due) {
          if (disposed) break;
          void runs.launch(item.automation, item.run).catch(() => undefined);
        }
      } catch {
        // Scheduling retries on the next tick; individual claimed runs record
        // launch failures in launch.
      } finally {
        evaluating = false;
      }
    };

    void evaluate();
    const timer = window.setInterval(() => void evaluate(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runs]);
}
