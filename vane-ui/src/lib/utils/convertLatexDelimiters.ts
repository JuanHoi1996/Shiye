/**
 * Convert $...$ / $$...$$ / \\(...\\) / \\[...\\] to <latex> tags for markdown-to-jsx + KaTeX.
 * DB stores model markdown; useChat applies this at display time (Copy uses the result too).
 */
function escapeForHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapLatex(formula: string, inline: boolean): string {
  const escaped = escapeForHtml(formula);
  return inline ? `<latex inline>${escaped}</latex>` : `<latex>${escaped}</latex>`;
}

function convertInProse(text: string): string {
  let s = text;
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => wrapLatex(formula, false));
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => wrapLatex(formula, false));
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => wrapLatex(formula, true));
  s = s.replace(/\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (_, formula) => wrapLatex(formula, true));
  return s;
}

function splitPreservingCodeFences(text: string): { inFence: boolean; content: string }[] {
  const segments: { inFence: boolean; content: string }[] = [];
  const fenceRe = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ inFence: false, content: text.slice(lastIndex, match.index) });
    }
    segments.push({ inFence: true, content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  segments.push({ inFence: false, content: text.slice(lastIndex) });
  return segments;
}

export function convertLatexDelimitersToTags(text: string): string {
  const safe = typeof text === 'string' ? text : '';
  return splitPreservingCodeFences(safe)
    .map((seg) => (seg.inFence ? seg.content : convertInProse(seg.content)))
    .join('');
}

const LATEX_TAG_RE = /<latex(?:\s+inline)?>[\s\S]*?<\/latex>/gi;
const LATEX_PLACEHOLDER_PREFIX = '\uE000LATEX';
const LATEX_PLACEHOLDER_SUFFIX = '\uE001';

/** Citation [n] replacement must not run inside <latex> (e.g. intervals like [0,1]). */
export function replaceCitationsOutsideLatex(
  text: string,
  citationRegex: RegExp,
  replacer: (fullMatch: string, captured: string) => string,
): string {
  const latexBlocks: string[] = [];
  const masked = text.replace(LATEX_TAG_RE, (block) => {
    latexBlocks.push(block);
    return `${LATEX_PLACEHOLDER_PREFIX}${latexBlocks.length - 1}${LATEX_PLACEHOLDER_SUFFIX}`;
  });

  const cited = masked.replace(citationRegex, replacer);
  return cited.replace(
    new RegExp(`${LATEX_PLACEHOLDER_PREFIX}(\\d+)${LATEX_PLACEHOLDER_SUFFIX}`, 'g'),
    (_, index) => latexBlocks[Number(index)],
  );
}
