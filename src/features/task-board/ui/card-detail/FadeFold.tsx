import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "../../../../shared/ui/icons";

/** Collapsed preview height; content up to `FOLD_PX + FOLD_SLACK_PX` is shown whole. */
const FOLD_PX = 240;
const FOLD_SLACK_PX = 64;

type Props = { children: ReactNode; label: string };

type FoldState = "whole" | "closed" | "open";

function foldState(height: number, open: boolean): FoldState {
  if (height <= FOLD_PX + FOLD_SLACK_PX) return "whole";
  return open ? "open" : "closed";
}

function foldHeight(state: FoldState, height: number): number | undefined {
  if (state === "whole") return undefined;
  return state === "open" ? height : FOLD_PX;
}

/**
 * Long content starts as a fixed-height preview that fades out at the bottom and
 * unfolds in place. Short content renders as is, with no toggle.
 */
export function FadeFold({ children, label }: Props): ReactNode {
  const id = useId();
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const state = foldState(height, open);
  const maxHeight = foldHeight(state, height);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        id={id}
        data-fold={state}
        style={maxHeight === undefined ? undefined : { maxHeight }}
        className="task-board-fold overflow-hidden"
      >
        <div ref={inner}>{children}</div>
      </div>
      {state === "whole" ? null : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex cursor-pointer items-center gap-1 self-start rounded-md px-1 py-0.5 text-[12px] text-content/50 outline-none transition-colors hover:text-content focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            strokeWidth={1.75}
          />
          {open ? "Show less" : "Show more"}
          <span className="sr-only"> of {label}</span>
        </button>
      )}
    </div>
  );
}
