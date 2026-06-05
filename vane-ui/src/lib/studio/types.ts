import type { Block, ResearchBlock } from '@/lib/types';

export type StudioLengthPreference = 'shorter' | 'standard' | 'longer';

export type StudioSpec = {
  instruction: string;
  lengthPreference: StudioLengthPreference;
  audience: string;
  genre: string;
  useResearch: boolean;
  fromChatId: string;
};

export const STUDIO_SPEC_MARKER = '__STUDIO_SPEC__';

function normalizeStudioSpec(raw: unknown): StudioSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const instruction = String(obj.instruction ?? obj.topic ?? '').trim();
  if (!instruction) return null;

  let lengthPreference = obj.lengthPreference as StudioLengthPreference | undefined;
  if (
    lengthPreference !== 'shorter' &&
    lengthPreference !== 'standard' &&
    lengthPreference !== 'longer'
  ) {
    const wc = Number(obj.wordCount ?? 1500);
    lengthPreference =
      wc <= 1000 ? 'shorter' : wc >= 2000 ? 'longer' : 'standard';
  }

  return {
    instruction,
    lengthPreference,
    audience: String(obj.audience ?? ''),
    genre: String(obj.genre ?? ''),
    useResearch: Boolean(obj.useResearch),
    fromChatId: String(obj.fromChatId ?? ''),
  };
}

function lengthPreferenceLabelZh(pref: StudioLengthPreference): string {
  switch (pref) {
    case 'shorter':
      return '短一些';
    case 'longer':
      return '长一些';
    default:
      return '适中';
  }
}

export function parseStudioSpecFromQuery(query: string): {
  spec: StudioSpec | null;
  displayQuery: string;
} {
  if (!query.startsWith(STUDIO_SPEC_MARKER)) {
    return { spec: null, displayQuery: query };
  }
  try {
    const raw = JSON.parse(query.slice(STUDIO_SPEC_MARKER.length));
    const spec = normalizeStudioSpec(raw);
    if (!spec) return { spec: null, displayQuery: query };
    return { spec, displayQuery: formatStudioDisplayQuery(spec) };
  } catch {
    return { spec: null, displayQuery: query };
  }
}

export function formatStudioDisplayQuery(spec: StudioSpec): string {
  return `撰写：${spec.instruction}（${lengthPreferenceLabelZh(spec.lengthPreference)} · ${spec.audience} · ${spec.genre}）`;
}

export function extractLatestDraftFromMessages(
  messages: { responseBlocks: Block[] }[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i]?.responseBlocks
      .filter((b): b is Block & { type: 'text' } => b.type === 'text')
      .map((b) => b.data)
      .join('\n')
      .trim();
    if (text) return text;
  }
  return '';
}

export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + latin;
}

export function extractStudioStatusLine(responseBlocks: Block[]): string {
  for (let i = responseBlocks.length - 1; i >= 0; i--) {
    const block = responseBlocks[i];
    if (block?.type !== 'research') continue;
    const research = block as ResearchBlock;
    for (let j = research.data.subSteps.length - 1; j >= 0; j--) {
      const step = research.data.subSteps[j];
      if (step?.type === 'reasoning' && step.reasoning?.trim()) {
        return step.reasoning.trim();
      }
    }
  }
  return '';
}
