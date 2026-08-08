import configManager from './index';
import { ConfigModelProvider } from './types';

export const getConfiguredModelProviders = (): ConfigModelProvider[] => {
  return configManager.getConfig('modelProviders', []);
};

export const getConfiguredModelProviderById = (
  id: string,
): ConfigModelProvider | undefined => {
  return getConfiguredModelProviders().find((p) => p.id === id) ?? undefined;
};

const DEFAULT_SEARXNG_URL = 'http://localhost:8080';

export const getSearxngURL = () => {
  const fromEnv = process.env.SEARXNG_API_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const fromConfig = configManager.getConfig('search.searxngURL', '') as string;
  const trimmed = typeof fromConfig === 'string' ? fromConfig.trim() : '';
  return trimmed || DEFAULT_SEARXNG_URL;
};

export type SearchProvider = 'searxng' | 'tavily';

/** Active web search backend. Env SEARCH_PROVIDER wins over config. */
export const getSearchProvider = (): SearchProvider => {
  const fromEnv = process.env.SEARCH_PROVIDER?.trim().toLowerCase();
  if (fromEnv === 'tavily' || fromEnv === 'searxng') return fromEnv;

  const fromConfig = configManager.getConfig('search.provider', 'searxng');
  if (fromConfig === 'tavily') return 'tavily';
  return 'searxng';
};

const dedupeKeys = (keys: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keys) {
    const k = raw.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
};

/**
 * Tavily key pool. Env wins when set:
 * - TAVILY_API_KEYS=k1,k2
 * - TAVILY_API_KEY=k1 (single)
 * Else config search.tavilyApiKeys (string[]).
 */
export const getTavilyApiKeys = (): string[] => {
  const fromKeysEnv = process.env.TAVILY_API_KEYS?.trim();
  const fromKeyEnv = process.env.TAVILY_API_KEY?.trim();
  if (fromKeysEnv || fromKeyEnv) {
    const parts: string[] = [];
    if (fromKeysEnv) parts.push(...fromKeysEnv.split(','));
    if (fromKeyEnv) parts.push(fromKeyEnv);
    return dedupeKeys(parts);
  }

  const fromConfig = configManager.getConfig('search.tavilyApiKeys', []);
  if (Array.isArray(fromConfig)) {
    return dedupeKeys(
      fromConfig.filter((k): k is string => typeof k === 'string'),
    );
  }
  if (typeof fromConfig === 'string' && fromConfig.trim()) {
    return [fromConfig.trim()];
  }
  return [];
};

/** @deprecated Prefer getTavilyApiKeys(); kept for callers that need one key. */
export const getTavilyApiKey = (): string => {
  return getTavilyApiKeys()[0] ?? '';
};
