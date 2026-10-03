import type { RefObject } from "react";

export interface OrbPoint {
  x: number;
  y: number;
  z: number;
}

export interface OrbProjectedPoint {
  x: number;
  y: number;
  radius: number;
  opacity: number;
}

export interface OrbAnimation {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasReady: boolean;
}
