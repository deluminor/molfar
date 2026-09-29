import { memo, useId, type ReactNode } from "react";
import {
  JARVIS_CENTER_OFFSET,
  JARVIS_ORBIT_TILTS,
  JARVIS_SURFACE_CURVES,
} from "../model/jarvis-constants";
import {
  createJarvisPoints,
  jarvisOrbitPoints,
  projectJarvisPoint,
} from "../model/jarvis-geometry";
import { useJarvisAnimation } from "./use-jarvis-animation";

export const JarvisVisual = memo(function JarvisVisual(): ReactNode {
  const coreId = useId();
  const { canvasRef, canvasReady } = useJarvisAnimation();

  return (
    <div
      className="relative h-full w-full overflow-hidden text-accent"
      role="img"
      aria-label="Jarvis holographic sphere with luminous orbiting arcs"
    >
      {!canvasReady && (
        <svg
          aria-hidden="true"
          viewBox="-250 -250 500 500"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <radialGradient id={coreId}>
              <stop offset="0" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g transform={`translate(0 ${-500 * JARVIS_CENTER_OFFSET})`}>
            <circle r="52.5" fill={`url(#${coreId})`} />
            {JARVIS_SURFACE_CURVES.map((curve, index) => (
              <path
                key={index}
                d={curve
                  .map((point, pointIndex) => {
                    const projected = projectJarvisPoint(point, 0, 500);
                    return `${pointIndex === 0 ? "M" : "L"}${projected.x},${projected.y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.55"
                opacity="0.12"
              />
            ))}
            <g fill="currentColor">
              {createJarvisPoints().map((point, index) => {
                const projected = projectJarvisPoint(point, 0, 500);
                return (
                  <circle
                    key={index}
                    cx={projected.x}
                    cy={projected.y}
                    r={projected.radius}
                    opacity={projected.opacity}
                  />
                );
              })}
            </g>
            {JARVIS_ORBIT_TILTS.map((tilt) => (
              <polyline
                key={tilt}
                points={jarvisOrbitPoints(tilt, 0, 500)
                  .map((point) => `${point.x},${point.y}`)
                  .join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.9"
                opacity="0.24"
              />
            ))}
          </g>
        </svg>
      )}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
});
