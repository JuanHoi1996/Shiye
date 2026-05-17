import { getEncoding } from 'js-tiktoken';

const splitRegex = /(?<=\. |\n|! |\? |; |:\s|\d+\.\s|- |\* )/g;

const enc = getEncoding('cl100k_base');

/** Avoid full tiktoken materialization on huge strings (JSON lines / minified blobs). */
const MAX_CHARS_FOR_FULL_ENCODE = 24_000;

const getTokenCount = (text: string): number => {
  if (text.length > MAX_CHARS_FOR_FULL_ENCODE) {
    return Math.ceil(text.length / 4);
  }
  try {
    return enc.encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
};

/** Force atomic pieces small enough that token heuristics and chunk assembly stay bounded. */
function explodeOversizedSegments(
  segments: string[],
  maxTokens: number,
): string[] {
  const maxCharsPerPiece = Math.max(512, maxTokens * 3);
  const out: string[] = [];

  for (const part of segments) {
    if (!part) continue;
    if (getTokenCount(part) <= maxTokens) {
      out.push(part);
      continue;
    }
    for (let i = 0; i < part.length; i += maxCharsPerPiece) {
      out.push(part.slice(i, i + maxCharsPerPiece));
    }
  }
  return out;
}

export const splitText = (
  text: string,
  maxTokens = 512,
  overlapTokens = 64,
): string[] => {
  let segments = text.split(splitRegex).filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  segments = explodeOversizedSegments(segments, maxTokens);

  const segmentTokenCounts = segments.map(getTokenCount);

  const result: string[] = [];

  let chunkStart = 0;

  while (chunkStart < segments.length) {
    let chunkEnd = chunkStart;
    let currentTokenCount = 0;

    while (chunkEnd < segments.length && currentTokenCount < maxTokens) {
      if (currentTokenCount + segmentTokenCounts[chunkEnd] > maxTokens) {
        break;
      }

      currentTokenCount += segmentTokenCounts[chunkEnd];
      chunkEnd++;
    }

    // A single segment may still exceed maxTokens (dense code / tokenizer vs heuristic).
    // Without this, chunkEnd === chunkStart forever and we spin until result[] blows up.
    if (chunkEnd === chunkStart && chunkStart < segments.length) {
      chunkEnd = chunkStart + 1;
    }

    let overlapBeforeStart = Math.max(0, chunkStart - 1);
    let overlapBeforeTokenCount = 0;

    while (overlapBeforeStart >= 0 && overlapBeforeTokenCount < overlapTokens) {
      if (
        overlapBeforeTokenCount + segmentTokenCounts[overlapBeforeStart] >
        overlapTokens
      ) {
        break;
      }

      overlapBeforeTokenCount += segmentTokenCounts[overlapBeforeStart];
      overlapBeforeStart--;
    }

    const overlapStartIndex = Math.max(0, overlapBeforeStart + 1);

    const overlapBeforeContent = segments
      .slice(overlapStartIndex, chunkStart)
      .join('');

    const chunkContent = segments.slice(chunkStart, chunkEnd).join('');

    result.push(overlapBeforeContent + chunkContent);

    chunkStart = chunkEnd;
  }

  return result;
};
