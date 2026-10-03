import type { RefObject } from "react";

export type FireStatus = "pending" | "running" | "still";

export type FireAnimation = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: FireStatus;
};

export type FireMotionState = {
  hidden: boolean;
  reducedMotion: boolean;
  onScreen: boolean;
  width: number;
  height: number;
};

export type FireParticle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  hot: boolean;
};

export type FirePalette = { accent: string; hot: string };
