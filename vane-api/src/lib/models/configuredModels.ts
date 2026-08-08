import { getConfiguredModelProviderById } from '@/lib/config/serverRegistry';
import { Model, ModelList } from './types';

/** User-enabled models only (C5 whitelist). Never merge stale hardcoded catalogs here. */
export function getConfiguredModelList(providerId: string): ModelList {
  const configProvider = getConfiguredModelProviderById(providerId);
  if (!configProvider) {
    return { chat: [], embedding: [] };
  }
  return {
    chat: [...(configProvider.chatModels ?? [])],
    embedding: [...(configProvider.embeddingModels ?? [])],
  };
}

/** Classify OpenAI-compatible /models ids into chat vs embedding (skip media/tools). */
export function classifyOpenAiCompatModelId(
  id: string,
): 'chat' | 'embedding' | 'skip' {
  const k = id.toLowerCase();
  if (k.includes('embedding')) return 'embedding';
  if (
    k.includes('whisper') ||
    k.includes('tts') ||
    k.includes('dall-e') ||
    k.includes('davinci') ||
    k.includes('babbage') ||
    k.includes('realtime') ||
    k.includes('moderation') ||
    k.includes('transcribe') ||
    k.includes('image') ||
    k.includes('sora') ||
    k.includes('codex-mini')
  ) {
    return 'skip';
  }
  return 'chat';
}

/**
 * GET {baseURL}/models (OpenAI-compatible). Returns empty lists on failure.
 * Example: fetchOpenAiCompatCatalog('https://api.openai.com/v1', apiKey)
 */
export async function fetchOpenAiCompatCatalog(
  baseURL: string,
  apiKey: string,
): Promise<ModelList> {
  const base = baseURL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      return { chat: [], embedding: [] };
    }
    const data = (await res.json()) as { data?: { id?: string }[] };
    const chat: Model[] = [];
    const embedding: Model[] = [];
    for (const row of data.data ?? []) {
      const id = row.id?.trim();
      if (!id) continue;
      const kind = classifyOpenAiCompatModelId(id);
      if (kind === 'skip') continue;
      const model = { key: id, name: id };
      if (kind === 'embedding') embedding.push(model);
      else chat.push(model);
    }
    return { chat, embedding };
  } catch {
    return { chat: [], embedding: [] };
  }
}
