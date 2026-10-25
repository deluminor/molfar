import { invoke } from "@tauri-apps/api/core";
import type { FsEntry } from "@/domain/files/file-entry";
import {
  loadProjectFiles,
  rankProjectFiles,
  resolveOpenablePath,
} from "@/features/files/model/file-index";
import {
  highlightForMobile,
  highlightInBackground,
  highlightProgress,
} from "./mobile-highlight";
import { displayPath } from "@/shared/lib/paths";
import { mobileProjectId, mobileProjectPaths } from "./mobile-catalog";
import { mobileWorktree } from "./mobile-models";

/** The project's checkout, or one of its worktrees when the phone names it. */
export async function mobileRoot(projectId: string, worktreePath?: string) {
  const cwd = mobileProjectPaths().find(
    (path) => mobileProjectId(path) === projectId,
  );
  if (!cwd) throw new Error("Project is no longer available");
  return worktreePath ? (await mobileWorktree(cwd, worktreePath)).path : cwd;
}

/** One folder of a working copy, by its path relative to the root. */
export async function mobileProjectFiles(
  projectId: string,
  relative: string,
  worktreePath?: string,
) {
  const root = await mobileRoot(projectId, worktreePath);
  const entries = await invoke<FsEntry[]>("mobile_list_dir", {
    root,
    relative,
  });
  return {
    entries: entries.map((entry) => ({
      name: entry.name,
      isDir: entry.isDir,
      ignored: entry.ignored,
    })),
  };
}

/** Files whose paths match a phone's search, best first, from the same index
 *  and ranking as the desktop's quick open. */
export async function mobileProjectSearch(
  projectId: string,
  query: string,
  worktreePath?: string,
) {
  const root = await mobileRoot(projectId, worktreePath);
  if (!query.trim()) return { results: [] };
  // Files only: a folder has nothing for the phone to open.
  const files = (await loadProjectFiles(root)).filter((file) => !file.isDir);
  return {
    results: rankProjectFiles(files, query, [], 50).map((file) => ({
      path: file.relative,
      name: file.name,
    })),
  };
}

/** Enough of a file to read on a phone, at most this many characters: tens of
 *  thousands of lines, well inside a reply's 8MB. Its colours, being larger,
 *  come separately a chunk at a time. */
const MOBILE_FILE_CHARS = 1024 * 1024;

/** One text file of a working copy, by its path relative to the root or as a
 *  transcript names it, with the path it was found at and its syntax colours
 *  when the desktop can highlight it. A large file comes
 *  plain with a background highlight's ID, for the phone to collect its
 *  colours from `mobileFileHighlight` as they are ready. */
export async function mobileProjectFile(
  projectId: string,
  relative: string,
  worktreePath?: string,
) {
  const root = await mobileRoot(projectId, worktreePath);
  let path = relative;
  let full: string;
  try {
    full = await invoke<string>("mobile_read_text_file", { root, relative });
  } catch (error) {
    // A file named in a transcript may be shortened (`Composer.tsx`) or carry
    // a line (`app.ts:12`); find it as the desktop's transcript links do.
    const resolved = await resolveOpenablePath(root, relative).catch(
      () => undefined,
    );
    if (!resolved || resolved === relative) throw error;
    full = await invoke<string>("mobile_read_text_file", {
      root,
      relative: resolved,
    });
    path = displayPath(resolved, root);
  }
  const text = full.slice(0, MOBILE_FILE_CHARS);
  const highlighted = await highlightForMobile(path, text);
  const highlightJob = highlighted
    ? undefined
    : highlightInBackground(path, text);
  return {
    path,
    text,
    truncated: full.length > MOBILE_FILE_CHARS,
    ...(highlighted ? { highlighted } : {}),
    ...(highlightJob ? { highlightJob } : {}),
  };
}

/** The colours a background highlight has finished, from line `from` on. */
export function mobileFileHighlight(job: string, from: number) {
  return highlightProgress(job, Math.max(0, from));
}
