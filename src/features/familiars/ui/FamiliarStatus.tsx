import { FAMILIAR_STATUS_LABEL, type FamiliarState } from "../model/familiar";

type Props = {
  state: FamiliarState;
  /** Project color, for the working dot. */
  color: string;
  className?: string;
};

/**
 * The Familiars status line: a dot (accent when it needs you, the project color
 * pulsing while it works, grey at rest), the state, and what it is on.
 */
export function FamiliarStatus({ state, color, className = "" }: Props) {
  const { status, activity } = state;
  const dot =
    status === "needs-you"
      ? "var(--color-accent)"
      : status === "working"
        ? color
        : undefined;
  return (
    <span
      data-familiar-status={status}
      title={activity}
      className={`flex min-w-0 items-center gap-1.5 ${className}`}
    >
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${dot ? "" : "bg-content/30"} ${
          status === "working" ? "animate-pulse" : ""
        }`}
        style={dot ? { background: dot } : undefined}
      />
      <span className="shrink-0">{FAMILIAR_STATUS_LABEL[status]}</span>
      {activity ? (
        <>
          <span aria-hidden className="shrink-0 opacity-60">
            ·
          </span>
          <span className="min-w-0 truncate">{activity}</span>
        </>
      ) : null}
    </span>
  );
}
