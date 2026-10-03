import { memo, type ReactNode } from "react";
import { useSphereAnimation } from "../hooks/useSphereAnimation";

export const SphereVisual = memo(function SphereVisual(): ReactNode {
  const { canvasRef, status } = useSphereAnimation();

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      role="img"
      aria-label="Glass sphere with orbiting agent rings around a golden core"
      data-sphere-status={status}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
});
