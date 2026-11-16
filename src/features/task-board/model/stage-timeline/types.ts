import type { StageRun } from "../../types/stage";

export type TimelineInterval = {
  start: number;
  end: number;
  duration: number;
  left: number;
  width: number;
};

export type TimelineRow = {
  run: StageRun;
  interval: TimelineInterval | null;
  completionUnavailable: boolean;
};

export type TimelineLayout = {
  origin: number | null;
  extent: number | null;
  totalElapsed: number | null;
  rows: TimelineRow[];
};
