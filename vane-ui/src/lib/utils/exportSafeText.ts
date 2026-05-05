import type { Block } from '@/lib/types';

/**
 * Build assistant body for PDF/plain export from stored blocks (not UI-rendered parsedText).
 * Example: buildAssistantExportPlaintext(msg.responseBlocks)
 */
export function buildAssistantExportPlaintext(blocks: Block[]): string {
  const parts = blocks
    .filter((b): b is Block & { type: 'text'; data: string } => b.type === 'text')
    .map((b) => b.data);
  return parts.join('\n\n');
}

/** Strip UI-only tags and thinking wrappers that should not appear in exports. */
export function stripExportArtifacts(text: string): string {
  let s = text;
  s = s.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '');
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/<citation\s+href="[^"]*"[^>]*>([^<]*)<\/citation>/gi, '[$1]');
  s = s.replace(/<latex>([\s\S]*?)<\/latex>/gi, '\n$1\n');
  s = s.replace(/<latex\s+inline>([\s\S]*?)<\/latex>/gi, '$1');
  s = s.replace(/\n{5,}/g, '\n\n\n\n');
  return s.trim();
}

/** Turn display $$...$$ into bracketed lines; leave single `$` alone (currency / edge cases). */
export function demoteLatexDelimitersToPlain(text: string): string {
  return text.replace(/\$\$([\s\S]*?)\$\$/g, '\n[$1]\n');
}

const URL_RE = /https?:\/\/[^\s<>[\]()]+/g;

/**
 * Help jsPDF splitTextToSize break long URLs and tokens by inserting U+200B after common break chars and inside long runs.
 */
export function insertSoftBreaksForPdf(text: string): string {
  let s = text.replace(URL_RE, (url) =>
    url.replace(/([/?:&=#._-])(?=.)/g, '$1\u200b'),
  );

  s = s.replace(/[^\s\u200b]{56,}/g, (run) => {
    if (/^https?:\/\//.test(run)) return run;
    let out = '';
    for (let i = 0; i < run.length; i += 40) {
      if (i > 0) out += '\u200b';
      out += run.slice(i, i + 40);
    }
    return out;
  });

  return s;
}

/** Full pipeline for assistant section in PDF export. */
export function assistantTextForPdfExport(blocks: Block[]): string {
  const raw = buildAssistantExportPlaintext(blocks);
  const cleaned = stripExportArtifacts(demoteLatexDelimitersToPlain(raw));
  return insertSoftBreaksForPdf(cleaned);
}
