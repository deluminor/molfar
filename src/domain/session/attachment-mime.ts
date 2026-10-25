import type { Attachment } from "./attachment";

/** A copied folder. No harness can open one, so it travels as its path. */
export const FOLDER_MIME = "inode/directory";

/** MIME types providers typically send as vision input. */
const VISION_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

export function isAttachmentFolder(file: Attachment): boolean {
  return file.mimeType === FOLDER_MIME;
}

export function isVisionImage(mimeType: string): boolean {
  return VISION_MIME.has(mimeType.toLowerCase());
}

export function normalizeImageMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}
