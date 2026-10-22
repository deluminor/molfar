import { highlightDiffFile } from "@/features/files/editor/syntax-tokens";
import type { HighlightRequest } from "./diff-highlight";

self.onmessage = async ({ data }: MessageEvent<HighlightRequest>) => {
  try {
    const tokens = await highlightDiffFile(data.file);
    self.postMessage({
      id: data.id,
      tokens: data.file.blocks.flatMap((block) =>
        block.lines.map((line) => tokens.get(line) ?? []),
      ),
    });
  } catch {
    self.postMessage({ id: data.id, tokens: [] });
  }
};
