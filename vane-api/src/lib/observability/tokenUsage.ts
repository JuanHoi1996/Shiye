import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

export type TokenUsagePhase = 'classifier' | 'researcher' | 'writer';

export type TokenUsageRecord = {
  timestamp: string;
  chatId: string;
  messageId: string;
  phase: TokenUsagePhase;
  providerId: string;
  modelKey: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  error?: string;
  optimizationMode?: string;
  reasoningPreset?: string;
  forceSearch?: boolean;
  researcherIteration?: number;
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

export function normalizeOpenAIUsage(usage: unknown): Pick<
  TokenUsageRecord,
  'inputTokens' | 'outputTokens' | 'totalTokens'
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
  return { inputTokens: input, outputTokens: output, totalTokens: total };
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
