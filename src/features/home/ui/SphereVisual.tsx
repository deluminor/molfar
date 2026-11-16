import { memo, type ReactNode } from "react";
import { useSphereAnimation } from "../hooks/use-sphere-animation";

export const SphereVisual = memo(function SphereVisual(): ReactNode {
  const { canvasRef, status } = useSphereAnimation();

  return (
    <div
      className="relative h-full w-full overflow-hidden text-accent"
      role="img"
      aria-label="Glass sphere with orbiting rings of light around a guiding star"
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
