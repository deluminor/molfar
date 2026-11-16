import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectNativePackages, expectedPackages, nativeTag } from "./github.mjs";

const version = "0.16.0-preview.1";
async function fixture(t, distribution = "validation") {
  const directory = await mkdtemp(join(tmpdir(), "native-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const records = [...expectedPackages(version)].map(([filename, target]) => ({ filename, target, distribution }));
  for (const { filename } of records) await writeFile(join(directory, filename), "fixture-package");
  const metadata = join(directory, "artifacts-fixture.json");
  await writeFile(metadata, JSON.stringify(records));
  return { directory, records, metadata };
}

test("native tags require an independent preview version", () => {
  assert.equal(nativeTag(version), `native-v${version}`);
  for (const bad of ["1.0.23", "v1.0.23", "../main", "0.16.0-preview.1\n"]) assert.throws(() => nativeTag(bad));
});

test("complete packages produce checksums without a production feed", async (t) => {
  const { directory } = await fixture(t);
  const result = await collectNativePackages(directory, version, "validation");
  assert.equal(result.files.length, 9);
  assert.ok(!result.files.includes("latest.json"));
  const manifest = JSON.parse(await readFile(join(directory, "github-release.json"), "utf8"));
  assert.equal(manifest.updater, false);
  const sums = await readFile(join(directory, "SHA256SUMS.txt"), "utf8");
  assert.equal(sums.trim().split("\n").length, 8);
  assert.match(sums, /^[a-f0-9]{64} {2}MolfarNative_/);
});

test("public collection rejects validation packages", async (t) => {
  const { directory } = await fixture(t);
  await assert.rejects(() => collectNativePackages(directory, version, "public"), /Distribution mismatch/);
});

test("public packages retain an isolated native tag", async (t) => {
  const { directory } = await fixture(t, "public");
  assert.equal((await collectNativePackages(directory, version, "public")).tag, `native-v${version}`);
});

for (const scenario of ["missing", "duplicate", "traversal", "target", "empty"]) {
  test(`release collection refuses ${scenario} artifacts`, async (t) => {
    const { directory, records, metadata } = await fixture(t);
    if (scenario === "missing") records.pop();
    if (scenario === "duplicate") records.push(records[0]);
    if (scenario === "traversal") records[0].filename = "../latest.json";
    if (scenario === "target") records[0].target = "windows-x86_64-nsis";
    if (scenario === "empty") await writeFile(join(directory, records[0].filename), "");
    await writeFile(metadata, JSON.stringify(records));
    await assert.rejects(() => collectNativePackages(directory, version, "validation"));
  });
}

test("publication refuses PRs, integration refs, other repos and mismatched commits", async () => {
  const { publicationContext } = await import("./publish.mjs");
  const sha = "a".repeat(40);
  const env = { NATIVE_PUBLISH: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REPOSITORY: "deluminor/molfar", GITHUB_SHA: sha };
  assert.equal(publicationContext(version, sha, env), `native-v${version}`);
  for (const change of [
    { NATIVE_PUBLISH: "false" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF: "refs/heads/migration/gpui-into-main" },
    { GITHUB_REPOSITORY: "hardbeat920/monocode" },
    { GITHUB_SHA: "b".repeat(40) },
  ]) assert.throws(() => publicationContext(version, sha, { ...env, ...change }));
});


test("publication uploads the complete native set before publishing a nonlatest prerelease", async (t) => {
  const { publishNative } = await import("./publish.mjs");
  const { directory } = await fixture(t, "public");
  const sha = "a".repeat(40);
  const env = { NATIVE_PUBLISH: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REPOSITORY: "deluminor/molfar", GITHUB_SHA: sha };
  const calls = [];
  await publishNative(directory, version, sha, env, (command, args) => {
    if (command === "git") return "";
    calls.push(args);
  });
  assert.deepEqual(calls.map((args) => args.slice(0, 2)), [["release", "create"], ["release", "upload"], ["release", "edit"]]);
  for (const args of calls) assert.deepEqual(args.slice(-2), ["-R", "deluminor/molfar"]);
  for (const index of [0, 2]) {
    assert.ok(calls[index].includes("--prerelease"));
    assert.ok(calls[index].includes("--latest=false"));
  }
  assert.ok(calls[0].includes("--draft"));
  assert.equal(calls[1].filter((arg) => arg.startsWith(directory)).length, 9);
  assert.ok(!calls[1].includes("--clobber"));
});

test("an upload failure keeps the draft; a conflicting tag blocks creation", async (t) => {
  const { publishNative } = await import("./publish.mjs");
  const { directory } = await fixture(t, "public");
  const sha = "a".repeat(40);
  const env = { NATIVE_PUBLISH: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REPOSITORY: "deluminor/molfar", GITHUB_SHA: sha };
  const calls = [];
  await assert.rejects(() => publishNative(directory, version, sha, env, (command, args) => {
    if (command === "git") return "";
    calls.push(args[1]);
    if (args[1] === "upload") throw new Error("upload failed");
  }), /upload failed/);
  assert.deepEqual(calls, ["create", "upload"]);
  await assert.rejects(() => publishNative(directory, version, sha, env, (command) => {
    assert.equal(command, "git");
    return `${"b".repeat(40)}\trefs/tags/native-v${version}\n`;
  }), /different commit/);
});

test("Mac signing falls back to ad-hoc only when every Apple credential is absent", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "native-signing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const githubEnv = join(directory, "github-env");
  await writeFile(githubEnv, "");
  const sign = (extra) => spawnSync("bash", ["scripts/native-release/apple-signing.sh"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, GITHUB_ENV: githubEnv, RUNNER_TEMP: directory, ...extra },
  });

  const partial = sign({ APPLE_CERTIFICATE: "partial" });
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /Incomplete public native signing configuration: APPLE_CERTIFICATE_PASSWORD/);
  assert.equal(await readFile(githubEnv, "utf8"), "");

  assert.equal(sign({}).status, 0);
  assert.equal(await readFile(githubEnv, "utf8"), "MOLFAR_NATIVE_MAC_SIGNING=adhoc\n");
});
