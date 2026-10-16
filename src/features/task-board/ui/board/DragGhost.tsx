import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import type { DragOrigin } from "../../hooks/use-board-drag";
import type { Card } from "../../types/card";

type Props = { card: Card; origin: DragOrigin; ghostRef: RefObject<HTMLDivElement | null> };

/** The card lifted under the pointer; the hook moves it without re-rendering the board. */
export function DragGhost({ card, origin, ghostRef }: Props): ReactNode {
  return createPortal(
    <div
      ref={ghostRef}
      aria-hidden
      style={{ left: origin.left, top: origin.top, width: origin.width, transform: `translate(${origin.dx}px, ${origin.dy}px)` }}
      className="pointer-events-none fixed z-50 flex rotate-[1.5deg] flex-col gap-1 rounded-xl border border-accent/50 bg-background-base py-2.5 pl-3.5 pr-3 shadow-[0_14px_32px_-10px_rgba(0,0,0,0.7)] will-change-transform"
    >
      <span className="font-mono text-[11px] tabular-nums text-content/55">#{card.number}</span>
      <span className="line-clamp-2 text-[13px] font-medium leading-[1.35] text-content">{card.title}</span>
    </div>,
    document.body,
  );
}
