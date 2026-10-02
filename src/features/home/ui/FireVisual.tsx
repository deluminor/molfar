import { memo, type ReactNode } from "react";
import { useFireAnimation } from "../hooks/useFireAnimation";

export const FireVisual = memo(function FireVisual(): ReactNode {
  const { canvasRef, status } = useFireAnimation();

  return (
    <div
      className="relative h-full w-full overflow-hidden text-accent"
      role="img"
      aria-label="Campfire of luminous particles with rising embers"
      data-fire-status={status}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
});
