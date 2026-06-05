import type { StudioLengthPreference, StudioSpec } from './types';

export function lengthPreferenceTargetWords(
  pref: StudioLengthPreference,
): number {
  switch (pref) {
    case 'shorter':
      return 900;
    case 'longer':
      return 2600;
    default:
      return 1500;
  }
}

export function lengthPreferencePromptLine(
  pref: StudioLengthPreference,
): string {
  switch (pref) {
    case 'shorter':
      return 'Concise — roughly 800–1100 words (Chinese characters count toward length; ±10%)';
    case 'longer':
      return 'In-depth — roughly 2200–2800 words (Chinese characters count toward length; ±10%)';
    default:
      return 'Standard — roughly 1300–1700 words (Chinese characters count toward length; ±10%)';
  }
}

export function normalizeStudioSpec(raw: unknown): StudioSpec | null {
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
