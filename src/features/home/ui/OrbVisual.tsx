import { memo, useId, type ReactNode } from "react";
import {
  ORB_CENTER_OFFSET,
  ORB_ORBIT_TILTS,
  ORB_SURFACE_CURVES,
} from "../model/orb/constants";
import {
  createOrbPoints,
  orbitPoints,
  projectOrbPoint,
} from "../model/orb/geometry";
import { useOrbAnimation } from "../hooks/useOrbAnimation";

export const OrbVisual = memo(function OrbVisual(): ReactNode {
  const coreId = useId();
  const { canvasRef, canvasReady } = useOrbAnimation();

  return (
    <div
      className="relative h-full w-full overflow-hidden text-accent"
      role="img"
      aria-label="Orb holographic sphere with luminous orbiting arcs"
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
          <g transform={`translate(0 ${-500 * ORB_CENTER_OFFSET})`}>
            <circle r="52.5" fill={`url(#${coreId})`} />
            {ORB_SURFACE_CURVES.map((curve, index) => (
              <path
                key={index}
                d={curve
                  .map((point, pointIndex) => {
                    const projected = projectOrbPoint(point, 0, 500);
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
              {createOrbPoints().map((point, index) => {
                const projected = projectOrbPoint(point, 0, 500);
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
            {ORB_ORBIT_TILTS.map((tilt) => (
              <polyline
                key={tilt}
                points={orbitPoints(tilt, 0, 500)
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
