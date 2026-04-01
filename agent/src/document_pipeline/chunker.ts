import type { Chunk, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";

export function chunker(doc: NormalizedDocument): Chunk[] {
  const lines = doc.content_text.split("\n").filter(Boolean);
  const chunks: Chunk[] = [];
  const size = 4;
  for (let i = 0; i < lines.length; i += size) {
    const text = lines.slice(i, i + size).join("\n");
    const relevance = Math.min(1, Math.max(0.1, text.length / 280));
    chunks.push({
      chunk_id: makeId("chunk"),
      normalized_doc_id: doc.normalized_doc_id,
      session_id: doc.session_id,
      text,
      title_path: doc.title_path,
      relevance_score: Number(relevance.toFixed(2)),
      created_at: new Date().toISOString()
    });
  }
  return chunks;
}
