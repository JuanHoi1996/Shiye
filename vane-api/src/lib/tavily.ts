import { getTavilyApiKey } from './config/serverRegistry';

export interface TavilySearchOptions {
  topic?: 'general' | 'news' | 'finance';
  includeDomains?: string[];
  excludeDomains?: string[];
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
}

export interface WebSearchHit {
  title: string;
  url: string;
  content?: string;
  img_src?: string;
  thumbnail_src?: string;
  thumbnail?: string;
  author?: string;
  iframe_src?: string;
}

const MAX_QUERY_CHARS = 400;

/** Call Tavily Search API; maps to the same hit shape as SearXNG. */
export async function searchTavily(
  query: string,
  opts?: TavilySearchOptions,
): Promise<{ results: WebSearchHit[]; suggestions: string[] }> {
  const apiKey = getTavilyApiKey();
  if (!apiKey) {
    throw new Error(
      'Tavily API key is not configured (search.tavilyApiKey or TAVILY_API_KEY).',
    );
  }

  const q =
    query.length > MAX_QUERY_CHARS
      ? `${query.slice(0, MAX_QUERY_CHARS)}…`
      : query;

  const body: Record<string, unknown> = {
    query: q,
    search_depth: opts?.searchDepth ?? 'basic',
    max_results: opts?.maxResults ?? 10,
    include_answer: false,
    topic: opts?.topic ?? 'general',
  };

  if (opts?.includeDomains?.length) {
    body.include_domains = opts.includeDomains;
  }
  if (opts?.excludeDomains?.length) {
    body.exclude_domains = opts.excludeDomains;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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
        `Tavily error: HTTP ${res.status} ${res.statusText}${detail}`,
      );
    }

    const data = (await res.json()) as {
      results?: {
        title?: string;
        url?: string;
        content?: string;
        raw_content?: string | null;
      }[];
    };

    const results: WebSearchHit[] = (data.results ?? [])
      .filter((r) => r.url && r.title)
      .map((r) => ({
        title: r.title!,
        url: r.url!,
        content: r.content || r.raw_content || r.title,
      }));

    return { results, suggestions: [] };
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('Tavily search timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
