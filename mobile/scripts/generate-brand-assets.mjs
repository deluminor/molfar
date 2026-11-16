// Renders the app's icons, splash and in-app mark from MOLFAR's desktop artwork
// (docs/brand/molfar-app.svg), so the phone and desktop share one source.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(resolve(mobile, "../package.json"))("playwright");
const source = readFileSync(resolve(mobile, "../docs/brand/molfar-app.svg"), "utf8");

const BACKDROP = /<rect width="1024" height="1024" fill="url\(#(bg|aura)\)"\/>/g;
const backdrops = source.match(BACKDROP);
if (backdrops?.length !== 2) throw new Error("molfar-app.svg no longer has its bg and aura layers");

const artwork = {
  full: source,
  glyph: source.replace(BACKDROP, ""),
  backdrop: source.replace(/<\/defs>[\s\S]*$/, `</defs>${backdrops.join("")}</svg>`),
};

// Android adaptive icons only promise the central 66% survives every mask.
const ADAPTIVE_SAFE_ZONE = 0.62;
const outputs = [
  { file: "images/icon.png", art: "full", size: 1024 },
  { file: "app.icon/Assets/icon.png", art: "full", size: 1024 },
  { file: "images/favicon.png", art: "full", size: 48 },
  { file: "images/splash-icon.png", art: "glyph", size: 456 },
  { file: "images/android-icon-background.png", art: "backdrop", size: 512 },
  { file: "images/android-icon-foreground.png", art: "glyph", size: 512, scale: ADAPTIVE_SAFE_ZONE },
  { file: "images/android-icon-monochrome.png", art: "glyph", size: 432, scale: ADAPTIVE_SAFE_ZONE, mode: "mark" },
  { file: "images/molfar-mark.png", art: "glyph", size: 1024, mode: "mark" },
  { file: "images/molfar-mark-inverse.png", art: "glyph", size: 512, mode: "inverse" },
];

// "mark" keeps the artwork's light as white: bright strokes and iris become
// opaque, the dark eye and pupil clear, so it can be tinted like a glyph.
async function render({ svg, size, scale, mode }) {
  const image = new Image();
  image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  const drawn = size * (scale ?? 1);
  context.drawImage(image, (size - drawn) / 2, (size - drawn) / 2, drawn, drawn);

  if (mode) {
    const pixels = context.getImageData(0, 0, size, size);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const light = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const alpha = Math.round(light * data[i + 3]);
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = mode === "inverse" ? 255 - alpha : alpha;
    }
    context.putImageData(pixels, 0, 0);
  }

  return canvas.toDataURL("image/png").split(",")[1];
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, art, ...options } of outputs) {
    const png = await page.evaluate(render, { svg: artwork[art], ...options });
    writeFileSync(resolve(mobile, "assets", file), Buffer.from(png, "base64"));
    console.log(`assets/${file}`);
  }
} finally {
  await browser.close();
}
