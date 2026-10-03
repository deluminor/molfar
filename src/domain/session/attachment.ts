export type AttachmentKind = "image" | "audio" | "file";

export type GeneratedImageMeta = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
  alt?: string;
};

export type Attachment = {
  /** Live transcript only; deliberately excluded from persisted attachments. */
  copyFromPath?: boolean;
  id: string;
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  size: number;
  /** Absolute path when the file lives on disk. */
  path?: string;
  /** Base64 payload for vision images (and pasted blobs) sent to the harness. */
  data?: string;
  /** Object URL for in-session thumbnails. Not persisted. */
  previewUrl?: string;
};
