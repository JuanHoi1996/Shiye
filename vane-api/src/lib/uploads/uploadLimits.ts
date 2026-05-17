const MB = 1024 * 1024;

/** Decoded text / JSON raw bytes we will load into a JS string (conservative default). */
export function maxTextLikeUploadBytes(): number {
  const raw = process.env.VANE_MAX_TEXT_UPLOAD_BYTES;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 12 * MB;
}

/** Try JSON.parse only under this size to avoid giant object graphs. */
export const MAX_JSON_PARSE_BYTES = 512 * 1024;

/** Cap embedding chunks per file to bound memory and provider payloads. */
export function maxEmbeddingChunksPerFile(): number {
  const raw = process.env.VANE_MAX_EMBEDDING_CHUNKS;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.min(n, 50_000);
  return 3000;
}

export const EMBED_TEXT_BATCH_SIZE = 64;
