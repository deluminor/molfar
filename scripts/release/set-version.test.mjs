import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readVersion, setVersion } from "./set-version.mjs";

const FILES = ["package.json", "package-lock.json", "Cargo.toml", "Cargo.lock", "src-tauri/tauri.conf.json"];
const roots = [];

function copyOfRepo() {
  const root = mkdtempSync(join(tmpdir(), "molfar-set-version-"));
  roots.push(root);
  mkdirSync(join(root, "src-tauri"));
  for (const file of FILES) copyFileSync(file, join(root, file));
  return root;
}

function convertToCrlf(root) {
  for (const file of FILES) {
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, "utf8").replace(/\r?\n/g, "\r\n"));
  }
}

function expectVersion(root, version) {
  const escaped = version.replaceAll(".", "\\.");

  expect(readVersion(root)).toBe(version);
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  expect(lock.version).toBe(version);
  expect(lock.packages[""].version).toBe(version);
  expect(readFileSync(join(root, "Cargo.toml"), "utf8")).toMatch(new RegExp(`^version = "${escaped}"\r?$`, "m"));
  expect(readFileSync(join(root, "Cargo.lock"), "utf8")).toMatch(
    new RegExp(`name = "molfar"\r?\nversion = "${escaped}"`),
  );
  expect(JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version).toBe(version);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("setVersion", () => {
  it("updates every manifest that carries the app version", () => {
    const root = copyOfRepo();

    setVersion(root, "9.8.7");

    expectVersion(root, "9.8.7");
  });

  it("updates CRLF checkouts the same way", () => {
    const root = copyOfRepo();
    convertToCrlf(root);

    setVersion(root, "9.8.7");

    expectVersion(root, "9.8.7");
    expect(readFileSync(join(root, "package-lock.json"), "utf8")).toContain("\r\n");
  });

  it("rejects a malformed version before touching files", () => {
    const root = copyOfRepo();
    const before = readFileSync(join(root, "package.json"), "utf8");

    expect(() => setVersion(root, "1.0")).toThrow("Not a release version");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });
});
