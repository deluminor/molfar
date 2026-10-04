import type { Attachment } from "@/domain/session/attachment";
import { MAX_ATTACHMENTS } from "@/domain/session/attachment-limits";
import {
  readClipboardFilePaths,
  readClipboardImage,
} from "@/platform/tauri/clipboard";
import { attachmentsFromPaths, attachmentsFromFiles } from "./attachments";

export type NativeClipboardPaste = {
  files: Attachment[];
  /** Set when the clipboard held more copies than one turn can carry. */
  warning?: string;
};

/**
 * Attachments for copied paths, filling a turn's quota with whatever the
 * filesystem actually accepts, plus how many paths it took to get there.
 *
 * A path that was moved or deleted yields no attachment, so paths are taken a
 * batch at a time until the quota is met. Counting them before converting would
 * drop a good file that sat behind an unreadable one.
 */
async function attachmentsFromClipboardPaths(paths: string[]) {
  const files: Attachment[] = [];
  let consumed = 0;
  while (consumed < paths.length && files.length < MAX_ATTACHMENTS) {
    const batch = paths.slice(consumed, consumed + MAX_ATTACHMENTS);
    for (const file of await attachmentsFromPaths(batch)) {
      if (files.length >= MAX_ATTACHMENTS) break;
      files.push(file);
    }
    consumed += batch.length;
  }
  return { files, consumed };
}

/**
 * Attachments for a paste the webview reported without a single file.
 *
 * `text` is what the webview saw on the clipboard. Copies made in a file
 * manager and screenshots reach us only through the native clipboard, so try
 * paths before image bytes; an image is only worth reading when the paste
 * carried no text at all.
 */
export async function nativeClipboardAttachments(
  text: string,
): Promise<NativeClipboardPaste> {
  const paths = await readClipboardFilePaths();
  if (paths.length) {
    const { files, consumed } = await attachmentsFromClipboardPaths(paths);
    if (!files.length)
      throw new Error(
        `Nothing to attach from ${paths.length === 1 ? "that path" : "those paths"} — the file may have been moved, renamed, or deleted.`,
      );
    return {
      files,
      ...(consumed < paths.length
        ? {
            warning: `Attached ${files.length} of ${paths.length} copied files. A turn carries up to ${MAX_ATTACHMENTS}.`,
          }
        : {}),
    };
  }
  if (text) return { files: [] };
  try {
    return { files: await attachmentsFromFiles([await readClipboardImage()]) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // An empty clipboard is a no-op. A real read failure still surfaces.
    if (reason === "The clipboard does not contain an image.")
      return { files: [] };
    throw error;
  }
}
