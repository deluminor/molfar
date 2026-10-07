import type { ComponentProps, ReactNode } from "react";
import { workSummaryLine } from "../../sessions/model/transcriptActivity";
import { FamiliarActivityTrail } from "../../sessions/ui/AgentTranscript";
import type { FamiliarLook } from "../model/familiar";
import { FamiliarSidebar, FamiliarSidebarHeader } from "./FamiliarSidebar";

/** A selected turn's trail, in the order it happened. */
export function FamiliarActivityPanel({
  agent,
  onClose,
  windowControls,
  ...trail
}: ComponentProps<typeof FamiliarActivityTrail> & {
  agent: FamiliarLook;
  onClose: () => void;
  windowControls?: ReactNode;
}) {
  // A settled turn sums up its work; a live one's steps speak for themselves.
  const summary = trail.live ? "" : workSummaryLine(trail.blocks);
  return (
    <FamiliarSidebar
      open
      kind="activity"
      label={`${agent.name} activity`}
      color={agent.color}
      windowControls={windowControls}
    >
      <FamiliarSidebarHeader title="Activity" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
        <div className="px-3 pb-3 pt-3">
          <p className="flex min-w-0 items-center gap-1.5 px-1 text-[11px] leading-4 text-content/45">
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${
                trail.live
                  ? "animate-pulse bg-[var(--familiar-color)]"
                  : "bg-content/30"
              }`}
            />
            <span className="shrink-0 text-content/70">
              {trail.live ? "Working" : "Finished"}
            </span>
            {summary ? <span className="truncate">· {summary}</span> : null}
          </p>
        </div>
        <div className="px-3 pb-4">
          <FamiliarActivityTrail {...trail} />
        </div>
      </div>
    </FamiliarSidebar>
  );
}
