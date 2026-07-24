import { searchSearxng } from './searxng';
import { searchTavily, type WebSearchHit } from './tavily';
import { getSearchProvider } from './config/serverRegistry';

export type SearchBackendOptions = {
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
  topic?: 'general' | 'news' | 'finance';
  includeDomains?: string[];
  maxResults?: number;
};

/**
 * Unified web search entry: SearXNG (default) or Tavily when configured.
 * Example: searchWeb('GPT-5 features') or searchWeb(q, { includeDomains: ['reddit.com'] })
 */
export async function searchWeb(
  query: string,
  opts?: SearchBackendOptions,
): Promise<{ results: WebSearchHit[]; suggestions: string[] }> {
  const provider = getSearchProvider();

  if (provider === 'tavily') {
    return searchTavily(query, {
      topic: opts?.topic,
      includeDomains: opts?.includeDomains,
      maxResults: opts?.maxResults,
    });
  }

  return searchSearxng(query, {
    categories: opts?.categories,
    engines: opts?.engines,
    language: opts?.language,
    pageno: opts?.pageno,
  });
}
