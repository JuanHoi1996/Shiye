import { Model } from '../../types';

/** Explicit capabilities.vision wins. Otherwise infer from the model id. */
export function inferOpenAiCompatVision(
  key: string,
  cap?: Model['capabilities'],
): boolean {
  if (cap?.vision === true) return true;
  if (cap?.vision === false) return false;
  const k = key.toLowerCase();
  if (k.includes('gpt-3.5') || k === 'gpt-4') return false;
  if (k.startsWith('kimi-k2.7-code')) return false;
  if (
    k.includes('gpt-4o') ||
    k.includes('gpt-4-turbo') ||
    k.includes('gpt-5') ||
    k.includes('gpt-4.1') ||
    k.startsWith('o1') ||
    k.startsWith('o3') ||
    k.startsWith('o4') ||
    k.startsWith('kimi-') ||
    k.includes('gemini') ||
    k.includes('claude') ||
    k.includes('grok') ||
    /qwen[\d.]*-vl/.test(k) ||
    k.includes('pixtral') ||
    k.includes('llava')
  ) {
    return true;
  }
  return false;
}
