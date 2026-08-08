import { getTavilyApiKeys } from './config/serverRegistry';

export type TavilyKeyUsageRow = {
  index: number;
  hint: string;
  ok: boolean;
  usage?: number;
  limit?: number | null;
  remaining?: number | null;
  plan?: string;
  error?: string;
};

const maskKey = (key: string): string => {
  const t = key.trim();
  if (t.length <= 4) return '····';
  return `···${t.slice(-4)}`;
};

async function fetchUsageForKey(apiKey: string): Promise<{
  ok: boolean;
  usage?: number;
  limit?: number | null;
  remaining?: number | null;
  plan?: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://api.tavily.com/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        error: `HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      };
    }
    const data = (await res.json()) as {
      key?: { usage?: number; limit?: number | null };
      account?: {
        current_plan?: string;
        plan_usage?: number;
        plan_limit?: number | null;
      };
    };
    const keyUsage = typeof data.key?.usage === 'number' ? data.key.usage : undefined;
    const keyLimit =
      data.key?.limit === undefined ? undefined : (data.key.limit as number | null);
    const planUsage =
      typeof data.account?.plan_usage === 'number'
        ? data.account.plan_usage
        : undefined;
    const planLimit =
      data.account?.plan_limit === undefined
        ? undefined
        : (data.account.plan_limit as number | null);

    // Prefer key-scoped quota; fall back to account plan when key.limit is null.
    const usage = keyUsage ?? planUsage ?? 0;
    const limit =
      typeof keyLimit === 'number'
        ? keyLimit
        : typeof planLimit === 'number'
          ? planLimit
          : keyLimit === null && planLimit === null
            ? null
            : (keyLimit ?? planLimit ?? null);
    const remaining =
      typeof limit === 'number' ? Math.max(0, limit - usage) : null;
    return {
      ok: true,
      usage,
      limit,
      remaining,
      plan:
        typeof data.account?.current_plan === 'string'
          ? data.account.current_plan
          : undefined,
    };
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      return { ok: false, error: 'Timed out' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Query Tavily /usage for each configured key (no secrets in the result). */
export async function getTavilyKeysUsage(): Promise<TavilyKeyUsageRow[]> {
  const keys = getTavilyApiKeys();
  const rows = await Promise.all(
    keys.map(async (key, index) => {
      const u = await fetchUsageForKey(key);
      return {
        index,
        hint: maskKey(key),
        ...u,
      };
    }),
  );
  return rows;
}
