import BaseEmbedding from '@/lib/models/base/embedding';
import { EMBED_TEXT_BATCH_SIZE } from '@/lib/uploads/uploadLimits';

/**
 * Run embeddings in fixed batches to cap request size and peak heap per provider call.
 */
export async function embedTextsBatched(
  model: BaseEmbedding<any>,
  texts: string[],
  batchSize: number = EMBED_TEXT_BATCH_SIZE,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const size = Math.max(1, Math.min(batchSize, 512));
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size);
    const embeddings = await model.embedText(batch);
    if (embeddings.length !== batch.length) {
      throw new Error('Embeddings and text chunks length mismatch');
    }
    out.push(...embeddings);
  }

  return out;
}
