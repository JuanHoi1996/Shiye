/**
 * Convert $...$ / $$...$$ / \\(...\\) / \\[...\\] to <latex> tags for markdown-to-jsx + KaTeX.
 * DB stores model markdown; useChat applies this at display time (Copy uses the result too).
 *
 * Formula is also stored in `tex` (encodeURIComponent) so markdown-to-jsx cannot eat
 * `*`, `\%`, `_` inside the tag body before KaTeX runs.
 */
function escapeForHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function formulaFromTexAttr(tex: string | undefined, fallback: string): string {
  if (typeof tex === 'string' && tex.length > 0) {
    try {
      return decodeURIComponent(tex);
    } catch {
      return tex;
    }
  }
  return fallback;
}

function wrapLatex(formula: string, inline: boolean): string {
  const escaped = escapeForHtml(formula);
  const tex = encodeURIComponent(formula);
  return inline
    ? `<latex inline tex="${tex}">${escaped}</latex>`
    : `<latex tex="${tex}">${escaped}</latex>`;
}

/** Currency / prose `$100` must not become math; require a TeX-ish token. */
export function looksLikeMath(formula: string): boolean {
  const t = formula.trim();
  if (!t) return false;
  if (/^\d[\d,]*(\.\d+)?$/.test(t)) return false;
  return /\\|[A-Za-z]|[\^_{}=]/.test(t);
}

function convertInlineDollarMath(s: string): string {
  // TeX: no space after opening `$` or before closing `$`. Skip `\$`.
  return s.replace(
    /(?<!\\)\$(?!\$)([^\s$][^$\n]*?[^\s$]|[^\s$])\$(?!\$)/g,
    (full, formula: string) =>
      looksLikeMath(formula) ? wrapLatex(formula, true) : full,
  );
}

function convertInProse(text: string): string {
  let s = text;
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => wrapLatex(formula, false));
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => wrapLatex(formula, false));
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => wrapLatex(formula, true));
  s = convertInlineDollarMath(s);
  return s;
}

const PROTECT_RE =
  /```[\s\S]*?```|`[^`\n]+`|<latex(?:\s[^>]*)?>[\s\S]*?<\/latex>/gi;

function ensureTexAttr(tag: string): string {
  if (/\btex\s*=/i.test(tag)) return tag;
  const m = tag.match(/^<latex(\s[^>]*)?>([\s\S]*?)<\/latex>$/i);
  if (!m) return tag;
  const inline = /\binline\b/i.test(m[1] || '');
  return wrapLatex(unescapeHtml(m[2]), inline);
}

export function convertLatexDelimitersToTags(text: string): string {
  const safe = typeof text === 'string' ? text : '';
  const parts: string[] = [];
  let lastIndex = 0;
  PROTECT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROTECT_RE.exec(safe)) !== null) {
    if (match.index > lastIndex) {
      parts.push(convertInProse(safe.slice(lastIndex, match.index)));
    }
    const chunk = match[0];
    parts.push(chunk.toLowerCase().startsWith('<latex') ? ensureTexAttr(chunk) : chunk);
    lastIndex = match.index + chunk.length;
  }
  if (lastIndex < safe.length) {
    parts.push(convertInProse(safe.slice(lastIndex)));
  }
  return parts.join('');
}

const LATEX_TAG_RE = /<latex(?:\s[^>]*)?>[\s\S]*?<\/latex>/gi;
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
