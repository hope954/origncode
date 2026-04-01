import type { NormalizedDocument } from "../types.js";

export function documentNormalizer(input: NormalizedDocument): NormalizedDocument {
  const cleanedBlocks = input.blocks
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return {
    ...input,
    blocks: cleanedBlocks,
    content_text: cleanedBlocks.join("\n"),
    title_path: input.title_path.length > 0 ? input.title_path : [input.title]
  };
}
