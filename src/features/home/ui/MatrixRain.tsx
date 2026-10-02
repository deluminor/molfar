import { useEffect, useRef, type ReactNode } from "react";
import {
  advanceColumns,
  columnFadeIn,
  createColumns,
  randomGlyph,
  shouldAnimateMatrix,
  type MatrixColumn,
} from "../model/matrix";

const CELL = 18;
const FONT_SIZE = 14;
const GLYPH_MUTATION = 0.018;

type Scene = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  rows: number;
  columns: MatrixColumn[];
  glyphs: string[][];
  accent: string;
  head: string;
};

function buildScene(canvas: HTMLCanvasElement): Scene | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const count = Math.ceil(rect.width / CELL);
  const rows = Math.ceil(rect.height / CELL);
  const style = getComputedStyle(canvas);
  return {
    ctx,
    width: rect.width,
    height: rect.height,
    rows,
    columns: createColumns(count, rows),
    glyphs: Array.from({ length: count }, () =>
      Array.from({ length: rows }, () => randomGlyph()),
    ),
    accent: style.getPropertyValue("--color-accent").trim() || "#4d9ef7",
    head: style.getPropertyValue("--color-content").trim() || "#ebebeb",
  };
}

function draw(scene: Scene): void {
  const { ctx, columns, glyphs, rows } = scene;
  ctx.clearRect(0, 0, scene.width, scene.height);
  ctx.font = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  columns.forEach((column, index) => {
    const fadeIn = columnFadeIn(column.head);
    if (fadeIn <= 0) return;

    for (let offset = 0; offset < column.length; offset++) {
      const isHead = offset === 0;

      // Distance is purely offset in the column
      const t = offset / column.length;
      const trailAlpha = isHead
        ? 0.95
        : Math.max(0.03, 0.8 * Math.pow(1 - t, 1.8));

      ctx.globalAlpha = trailAlpha * fadeIn;
      ctx.fillStyle = isHead ? scene.head : scene.accent;

      const x = index * CELL + CELL / 2;
      // Smooth continuous sliding down the screen
      const y = (column.head - offset) * CELL;

      // If it's completely off-screen, skip rendering
      if (y < -CELL || y > scene.height + CELL) continue;

      // Bind the glyph to the offset so the character stays the same as it falls.
      // We use index and offset to deterministically pick a glyph from the pre-generated array.
      const glyphRow = (index * 7 + offset) % rows;

      // Randomly mutate glyphs slightly
      if (Math.random() < GLYPH_MUTATION) {
        glyphs[index][glyphRow] = randomGlyph();
      }

      // Head glyph gets a soft glow halo
      if (isHead) {
        ctx.save();
        ctx.globalAlpha = 0.2 * fadeIn;
        ctx.fillStyle = scene.head;
        ctx.font = `${FONT_SIZE * 1.6}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillText(glyphs[index][glyphRow], x, y - FONT_SIZE * 0.2);
        ctx.restore();
        ctx.globalAlpha = 0.95 * fadeIn;
        ctx.fillStyle = scene.head;
        ctx.font = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      }

      ctx.fillText(glyphs[index][glyphRow], x, y);
    }
  });
  ctx.globalAlpha = 1;
}

/** Accent-colored falling glyphs; time-based for buttery-smooth motion. */
export function MatrixRain(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scene = buildScene(canvas);
    let raf = 0;
    let last = performance.now();

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const frame = (now: number) => {
      if (!scene) return;
      const deltaMs = Math.min(48, now - last);
      last = now;
      scene.columns = advanceColumns(scene.columns, scene.rows, deltaMs);
      draw(scene);
      raf = requestAnimationFrame(frame);
    };

    const sync = () => {
      stop();
      if (!scene) return;
      draw(scene);
      last = performance.now();
      if (shouldAnimateMatrix(motion.matches, document.hidden)) {
        raf = requestAnimationFrame(frame);
      }
    };

    const resizeObs = new ResizeObserver(() => {
      scene = buildScene(canvas);
      sync();
    });

    resizeObs.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    sync();
    return () => {
      stop();
      resizeObs.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />;
}
