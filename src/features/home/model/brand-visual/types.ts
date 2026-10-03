import type { RefObject } from "react";

export type BrandVisual = "sphere" | "fire" | "orb";

export interface BrandVisualSelectorProps {
  value: BrandVisual;
  onChange: (value: BrandVisual) => void;
}

export type BrandPalette = { accent: string; hot: string };

export type BrandVisualStatus = "pending" | "running" | "paused" | "still";

export type BrandCanvas = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: BrandVisualStatus;
};

export type BrandMotionState = {
  hidden: boolean;
  reducedMotion: boolean;
  onScreen: boolean;
  width: number;
  height: number;
};

export type BrandFrame<Theme> = {
  width: number;
  height: number;
  seconds: number;
  theme: Theme;
};

export type BrandCanvasOptions<Theme> = {
  stillSeconds: number;
  readTheme: (canvas: HTMLCanvasElement) => Theme;
  draw: (context: CanvasRenderingContext2D, frame: BrandFrame<Theme>) => void;
};
