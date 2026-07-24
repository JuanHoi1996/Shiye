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

export const getTavilyApiKey = (): string => {
  const fromEnv = process.env.TAVILY_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = configManager.getConfig('search.tavilyApiKey', '') as string;
  return typeof fromConfig === 'string' ? fromConfig.trim() : '';
};
