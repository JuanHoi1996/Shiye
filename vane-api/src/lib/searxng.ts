import { getSearxngURL } from './config/serverRegistry';

interface SearxngSearchOptions {
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
}

interface SearxngSearchResult {
  title: string;
  url: string;
  img_src?: string;
  thumbnail_src?: string;
  thumbnail?: string;
  content?: string;
  author?: string;
  iframe_src?: string;
}

/** Avoid huge GET URLs and odd SearXNG 400s from overlong `q`. */
const MAX_SEARXNG_QUERY_CHARS = 2000;

export const searchSearxng = async (
  query: string,
  opts?: SearxngSearchOptions,
) => {
  const searxngURL = getSearxngURL().replace(/\/$/, '');
  if (!searxngURL) {
    throw new Error(
      'SearXNG base URL is not configured (search.searxngURL or SEARXNG_API_URL).',
    );
  }

  const q =
    query.length > MAX_SEARXNG_QUERY_CHARS
      ? `${query.slice(0, MAX_SEARXNG_QUERY_CHARS)}…`
      : query;

  const url = new URL(`${searxngURL}/search?format=json`);
  url.searchParams.append('q', q);

  if (opts) {
    Object.keys(opts).forEach((key) => {
      const value = opts[key as keyof SearxngSearchOptions];
      if (Array.isArray(value)) {
        url.searchParams.append(key, value.join(','));
        return;
      }
      url.searchParams.append(key, value as string);
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const t = await res.text();
        detail = t ? ` body=${t.slice(0, 400)}` : '';
      } catch {
        /* ignore */
      }
      throw new Error(
        `SearXNG error: HTTP ${res.status} ${res.statusText}${detail}`,
      );
    }

    const data = await res.json();

    const results: SearxngSearchResult[] = data.results;
    const suggestions: string[] = data.suggestions;

    return { results, suggestions };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('SearXNG search timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};
