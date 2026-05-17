import { MAX_JSON_PARSE_BYTES } from '@/lib/uploads/uploadLimits';

const MAX_STRINGIFIED_JSON_CHARS = 2 * 1024 * 1024;

/**
 * Turn uploaded JSON bytes into linearizable text for chunking/embeddings.
 * Small files: parse + single-line stringify (stable for structured RAG).
 * Large files: UTF-8 text only — no full-document JSON.parse (avoids huge object graphs).
 */
export function bufferToJsonSearchableText(buf: Buffer): string {
  if (buf.length === 0) return '';

  if (buf.length > MAX_JSON_PARSE_BYTES) {
    return buf.toString('utf8');
  }

  const raw = buf.toString('utf8');
  try {
    const v = JSON.parse(raw) as unknown;
    const out = JSON.stringify(v);
    if (out.length > MAX_STRINGIFIED_JSON_CHARS) {
      return (
        out.slice(0, MAX_STRINGIFIED_JSON_CHARS) + '\n…[json stringified output truncated]\n'
      );
    }
    return out;
  } catch {
    return raw;
  }
}
