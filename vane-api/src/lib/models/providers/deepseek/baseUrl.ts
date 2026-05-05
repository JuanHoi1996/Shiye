/**
 * OpenAI Node SDK calls POST `${baseURL}/chat/completions`.
 * DeepSeek official OpenAI-style base is `https://api.deepseek.com` (not `.../v1`),
 * see https://api-docs.deepseek.com/
 * Legacy configs often used `https://api.deepseek.com/v1`, which would hit the wrong path.
 */
export const DEEPSEEK_OPENAI_DEFAULT_BASE = 'https://api.deepseek.com';

export function normalizeDeepSeekOpenAIBaseURL(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  try {
    const u = new URL(trimmed);
    if (u.hostname === 'api.deepseek.com' && u.pathname === '/v1') {
      return `${u.protocol}//${u.hostname}`;
    }
  } catch {
    // keep trimmed string
  }
  return trimmed;
}
