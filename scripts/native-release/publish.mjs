import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectNativePackages, nativeTag } from "./github.mjs";

export function publicationContext(version, sha, env) {
  const tag = nativeTag(version);
  if (env.NATIVE_PUBLISH !== "true" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_REPOSITORY !== "deluminor/molfar")
    throw new Error("Native publication requires a manual run from MOLFAR main");
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== env.GITHUB_SHA)
    throw new Error("Native release must use the workflow commit");
  return tag;
}

export async function publishNative(directory, version, sha, env = process.env, command = execFileSync) {
  const tag = publicationContext(version, sha, env);
  const { files } = await collectNativePackages(directory, version, "public");
  const existing = command("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: "utf8", env }).trim();
  if (existing) {
    const refs = existing.split("\n");
    const peeled = refs.find((line) => line.endsWith("^{}")) || refs[0];
    if (peeled.split(/\s/)[0] !== sha) throw new Error("Native tag already points to a different commit");
  }
  const gh = (args) => command("gh", [...args, "-R", "deluminor/molfar"], { stdio: "inherit", env });
  gh(["release", "create", tag, "--target", sha, "--draft", "--prerelease", "--latest=false", "--title", `MOLFAR Native ${version}`, "--notes-file", "docs/native/release-notes.md"]);
  gh(["release", "upload", tag, ...files.map((file) => resolve(directory, file))]);
  gh(["release", "edit", tag, "--draft=false", "--prerelease", "--latest=false"]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publishNative(...process.argv.slice(2));
}
