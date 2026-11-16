import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "crates/molfar-gpui/assets");
const svg = await readFile(join(root, "docs/brand/molfar-app.svg"), "utf8");
const browser = await chromium.launch();
const iconset = await mkdtemp(join(tmpdir(), "molfar-native-"));
try {
  const page = await browser.newPage();
  const render = async (size) => {
    const png = await page.evaluate(async ({ svg, size }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas rendering is unavailable");
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { svg, size });
    return Buffer.from(png, "base64");
  };

  await writeFile(join(assets, "molfar.png"), await render(1024));
  await writeFile(join(assets, "molfar-native.png"), await render(256));
  if (process.platform === "darwin") {
    const folder = `${iconset}.iconset`;
    await mkdir(folder);
    try {
      for (const size of [16, 32, 128, 256, 512]) {
        await writeFile(join(folder, `icon_${size}x${size}.png`), await render(size));
        await writeFile(join(folder, `icon_${size}x${size}@2x.png`), await render(size * 2));
      }
      execFileSync("iconutil", ["-c", "icns", folder, "-o", join(assets, "molfar.icns")]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
  await rm(iconset, { recursive: true, force: true });
}
