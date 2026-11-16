import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "../../../../../shared/ui/Modal";
import { Popover } from "../../../../../shared/ui/Popover";
import type { TimelineLayout } from "../../../model/stage-timeline/types";
import { elapsedLabel } from "../../../model/card-status";
import { StageRunLane } from "./StageRunLane";
import { StageRunDetails } from "./StageRunDetails";

import type { Inspection } from "./types";

export function StageTimelineDialog({
  title,
  layout,
  summary,
  onClose,
  onOpenSession,
}: {
  title: string;
  layout: TimelineLayout;
  summary: ReactNode;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
}): ReactNode {
  const content = useRef<HTMLDivElement>(null);
  const inspectionSurface = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(layout.rows[0]?.run.id);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const departure = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cancelDeparture = () => clearTimeout(departure.current);
  const leave = () => {
    cancelDeparture();
    departure.current = setTimeout(() => setInspection(null), 150);
  };
  const inspect = (id: string, anchor?: HTMLElement) => {
    cancelDeparture();
    setSelected(id);
    if (anchor) setInspection({ id, anchor });
  };
  const open = (sessionId: string) => {
    onClose();
    onOpenSession(sessionId);
  };
  const selectedRow = layout.rows.find((row) => row.run.id === selected);
  const hoveredRow = layout.rows.find((row) => row.run.id === inspection?.id);

  useEffect(() => {
    const dialog = content.current?.closest('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) return;
    const contain = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex="0"]',
        ),
      ];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    const guard = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !dialog.contains(event.target) &&
        !document.querySelector("[data-dialog-popover]")?.contains(event.target)
      ) {
        dialog.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("keydown", contain, true);
    document.addEventListener("focusin", guard);
    return () => {
      document.removeEventListener("keydown", contain, true);
      document.removeEventListener("focusin", guard);
      clearTimeout(departure.current);
    };
  }, []);

  return (
    <Modal title={title} onClose={onClose} size="lg" fitViewport>
      <div
        className="stage-timeline-dialog p-4"
        ref={content}
        onPointerLeave={leave}
        onBlur={(event) => {
          const destination = event.relatedTarget;
          const withinTrigger =
            destination instanceof Node &&
            Boolean(inspection?.anchor.contains(destination));
          const withinDetails =
            destination instanceof Node &&
            Boolean(inspectionSurface.current?.contains(destination));
          if (!withinTrigger && !withinDetails) setInspection(null);
        }}
      >
        <div className="flex flex-wrap items-center gap-3 pb-3 text-[12px] tabular-nums">
          <span>
            {layout.totalElapsed === null
              ? "Timing unavailable"
              : `Total elapsed ${elapsedLabel(layout.totalElapsed)}`}
          </span>
          {summary}
        </div>
        <div className="timeline-chart" aria-label="Stage run swimlanes">
          {layout.origin !== null ? (
            <div className="timeline-axis">
              <span>Stage</span>
              <div className="flex justify-between">
                <span>0m</span>
                <span>{elapsedLabel((layout.totalElapsed ?? 0) / 2)}</span>
                <span>{elapsedLabel(layout.totalElapsed ?? 0)}</span>
              </div>
              <span />
            </div>
          ) : (
            <p>Timing unavailable</p>
          )}
          {layout.rows.map((row) => (
            <div key={row.run.id} onPointerLeave={leave}>
              <StageRunLane row={row} onInspect={inspect} onOpen={open} />
            </div>
          ))}
        </div>
        <section
          aria-label="Selected run details"
          className="timeline-selected"
          tabIndex={0}
        >
          {selectedRow ? (
            <StageRunDetails row={selectedRow} />
          ) : (
            <p>Select a run to inspect.</p>
          )}
        </section>
        {inspection && hoveredRow ? (
          <Popover
            ref={inspectionSurface}
            anchor={inspection.anchor}
            width={360}
            maxHeight={240}
            autoFocus={false}
            onDismiss={() => setInspection(null)}
            onPointerEnter={cancelDeparture}
            onPointerLeave={leave}
          >
            <StageRunDetails row={hoveredRow} />
          </Popover>
        ) : null}
      </div>
    </Modal>
  );
}
