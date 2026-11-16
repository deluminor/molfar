import type { StageStatus } from "../../../types/stage";

export const RUN_STATUS: Record<
  StageStatus,
  { label: string; dot: string; text: string }
> = {
  running: {
    label: "Running",
    dot: "bg-accent task-board-breathe",
    text: "text-accent",
  },
  succeeded: {
    label: "Succeeded",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
  },
  failed: { label: "Failed", dot: "bg-rose-400", text: "text-rose-300" },
  cancelled: {
    label: "Cancelled",
    dot: "bg-content/30",
    text: "text-content/45",
  },
  interrupted: {
    label: "Interrupted",
    dot: "bg-amber-300",
    text: "text-amber-300",
  },
};
