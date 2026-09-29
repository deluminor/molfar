import type { JarvisPoint } from "./jarvis-types";

export function createJarvisSurfaceCurves(): JarvisPoint[][] {
  const latitudes = [-0.7, -0.35, 0, 0.35, 0.7].map((y) =>
    Array.from({ length: 97 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      const radius = Math.sqrt(1 - y * y);
      return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
    }),
  );

  const meridians = Array.from({ length: 6 }, (_, meridian) => {
    const longitude = (meridian / 6) * Math.PI;

    return Array.from({ length: 97 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return {
        x: Math.cos(angle) * Math.cos(longitude),
        y: Math.sin(angle),
        z: Math.cos(angle) * Math.sin(longitude),
      };
    });
  });

  return [...latitudes, ...meridians];
}
