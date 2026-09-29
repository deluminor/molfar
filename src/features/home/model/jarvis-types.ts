import type { RefObject } from "react";

export interface JarvisPoint {
  x: number;
  y: number;
  z: number;
}

export interface JarvisProjectedPoint {
  x: number;
  y: number;
  radius: number;
  opacity: number;
}

export interface JarvisAnimation {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasReady: boolean;
}
