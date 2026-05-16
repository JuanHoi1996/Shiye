import iconv from 'iconv-lite';
import * as jschardet from 'jschardet';

const SAMPLE_MAX = 512 * 1024;

/** Map jschardet / browser-reported names to iconv-lite codec names. */
function normalizeEncodingForIconv(encoding: string): string {
  const e = encoding.trim().toLowerCase().replace(/_/g, '-');
  if (e === 'gb2312' || e === 'gb-2312' || e === 'gbk') return 'gbk';
  if (e === 'utf-8' || e === 'utf8') return 'utf8';
  if (e === 'ascii' || e === 'us-ascii') return 'utf8';
  if (e === 'utf-16' || e === 'utf-16le') return 'utf16le';
  if (e === 'utf-16be') return 'utf16be';
  if (e === 'iso-8859-1' || e === 'latin1') return 'latin1';
  return e;
}

/**
 * Decode a text file buffer using charset detection + iconv fallback.
 * Example: GBK .txt files decode correctly instead of mojibake from utf-8.
 */
export function decodeBufferToString(buf: Buffer): string {
  if (buf.length === 0) return '';

  const sample = buf.subarray(0, Math.min(buf.length, SAMPLE_MAX));
  let detected: { encoding: string; confidence: number };
  try {
    detected = jschardet.detect(sample);
  } catch (err) {
    console.warn('[decodeText] jschardet.detect failed', err);
    return buf.toString('utf8');
  }

  const rawEnc = detected.encoding?.trim() ?? '';
  const confidence = detected.confidence ?? 0;

  if (!rawEnc || confidence < 0.5) {
    if (confidence > 0 && confidence < 0.5) {
      console.warn('[decodeText] low charset confidence', {
        encoding: rawEnc,
        confidence,
      });
    }
    return buf.toString('utf8');
  }

  const encLower = rawEnc.toLowerCase();
  if (encLower === 'ascii' || encLower === 'utf-8' || encLower === 'utf8') {
    return buf.toString('utf8');
  }

  const iconvEnc = normalizeEncodingForIconv(rawEnc);
  if (iconvEnc === 'utf8') {
    return buf.toString('utf8');
  }

  try {
    if (!iconv.encodingExists(iconvEnc)) {
      console.warn('[decodeText] iconv-lite has no codec', { iconvEnc, rawEnc });
      return buf.toString('utf8');
    }
    return iconv.decode(buf, iconvEnc);
  } catch (err) {
    console.warn('[decodeText] iconv decode failed', {
      iconvEnc,
      rawEnc,
      confidence,
      err,
    });
    return buf.toString('utf8');
  }
}
