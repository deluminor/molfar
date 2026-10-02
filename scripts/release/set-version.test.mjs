import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readVersion, setVersion } from "./set-version.mjs";

const FILES = ["package.json", "package-lock.json", "Cargo.toml", "Cargo.lock", "src-tauri/tauri.conf.json"];
const roots = [];

function copyOfRepo() {
  const root = mkdtempSync(join(tmpdir(), "vatra-set-version-"));
  roots.push(root);
  mkdirSync(join(root, "src-tauri"));
  for (const file of FILES) copyFileSync(file, join(root, file));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("setVersion", () => {
  it("updates every manifest that carries the app version", () => {
    const root = copyOfRepo();

    setVersion(root, "9.8.7");

    expect(readVersion(root)).toBe("9.8.7");
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    expect(lock.version).toBe("9.8.7");
    expect(lock.packages[""].version).toBe("9.8.7");
    expect(readFileSync(join(root, "Cargo.toml"), "utf8")).toMatch(/^version = "9\.8\.7"$/m);
    expect(readFileSync(join(root, "Cargo.lock"), "utf8")).toContain('name = "vatra"\nversion = "9.8.7"');
    expect(JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version).toBe("9.8.7");
  });

  it("rejects a malformed version before touching files", () => {
    const root = copyOfRepo();
    const before = readFileSync(join(root, "package.json"), "utf8");

    expect(() => setVersion(root, "1.0")).toThrow("Not a release version");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });
});
