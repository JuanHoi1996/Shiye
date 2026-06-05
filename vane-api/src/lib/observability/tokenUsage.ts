import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

export type TokenUsagePhase =
  | 'classifier'
  | 'researcher'
  | 'writer_draft'
  | 'verifier'
  | 'writer'
  | 'advisor'
  | 'memory_update'
  | 'studio_writer'
  | 'studio_verifier'
  | 'studio_researcher';

export type TokenUsageRecord = {
  timestamp: string;
  chatId: string;
  messageId: string;
  phase: TokenUsagePhase;
  providerId: string;
  modelKey: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Prompt tokens served from provider prompt cache (OpenAI-style `prompt_tokens_details.cached_tokens`). */
  cachedTokens?: number;
  totalTokens?: number;
  error?: string;
  /** API value: `speed` | `balanced` | `quality` (UI label for quality = DeepResearch). */
  optimizationMode?: string;
  /** True when optimizationMode is `quality` (DeepResearch pipeline). */
  deepResearch?: boolean;
  reasoningPreset?: string;
  researcherIteration?: number;
  /** Classifier decision; also on researcher rows. */
  skipSearch?: boolean;
  personalSearch?: boolean;
  /** Writer only: whether the Researcher agent ran for this answer. */
  researcherRan?: boolean;
};

function tokenUsageDir(): string {
  return path.join(process.cwd(), 'data', 'token-usage');
}

function dayJsonlPath(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return path.join(tokenUsageDir(), `${y}-${mo}-${day}.jsonl`);
}

function cachedTokensFromUsage(u: Record<string, unknown>): number | undefined {
  const fromDetails = (details: unknown): number | undefined => {
    if (!details || typeof details !== 'object') return undefined;
    const d = details as Record<string, unknown>;
    const c = d.cached_tokens ?? d.cached_input_tokens;
    return typeof c === 'number' ? c : undefined;
  };
  return (
    fromDetails(u.prompt_tokens_details) ??
    fromDetails(u.input_tokens_details) ??
    (typeof u.cached_prompt_tokens === 'number' ? u.cached_prompt_tokens : undefined)
  );
}

/** Fields for JSONL rows: keeps `quality` for DB/API compatibility; adds `deepResearch` flag. */
export function tokenUsageModeFields(
  mode: string | undefined,
): Pick<TokenUsageRecord, 'optimizationMode' | 'deepResearch'> {
  const optimizationMode = mode ?? 'unknown';
  return {
    optimizationMode,
    ...(optimizationMode === 'quality' ? { deepResearch: true } : {}),
  };
}

export function normalizeOpenAIUsage(usage: unknown): Pick<
  TokenUsageRecord,
  'inputTokens' | 'outputTokens' | 'totalTokens' | 'cachedTokens'
> {
  if (!usage || typeof usage !== 'object') return {};
  const u = usage as Record<string, unknown>;
  const input =
    typeof u.prompt_tokens === 'number'
      ? u.prompt_tokens
      : typeof u.input_tokens === 'number'
        ? u.input_tokens
        : undefined;
  const output =
    typeof u.completion_tokens === 'number'
      ? u.completion_tokens
      : typeof u.output_tokens === 'number'
        ? u.output_tokens
        : undefined;
  const total =
    typeof u.total_tokens === 'number'
      ? u.total_tokens
      : input !== undefined && output !== undefined
        ? input + output
        : undefined;
  const cached = cachedTokensFromUsage(u);
  const out: Pick<
    TokenUsageRecord,
    'inputTokens' | 'outputTokens' | 'totalTokens' | 'cachedTokens'
  > = { inputTokens: input, outputTokens: output, totalTokens: total };
  if (cached !== undefined) out.cachedTokens = cached;
  return out;
}

/**
 * Append one JSONL line under `data/token-usage/YYYY-MM-DD.jsonl` (cwd = vane-api).
 * Example: appendTokenUsage({ chatId, messageId, phase: 'writer', providerId, modelKey, ...normalizeOpenAIUsage(u) })
 */
export function appendTokenUsage(
  record: Omit<TokenUsageRecord, 'timestamp'> & { timestamp?: string },
): void {
  const dir = tokenUsageDir();
  const file = dayJsonlPath();
  const line =
    JSON.stringify({
      ...record,
      timestamp: record.timestamp ?? new Date().toISOString(),
    }) + '\n';
  void (async () => {
    try {
      await mkdir(dir, { recursive: true });
      await appendFile(file, line, 'utf8');
    } catch (e) {
      console.warn('[tokenUsage] append failed:', e);
    }
  })();
}
