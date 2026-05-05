import type { GenerateOptions } from '../../types';

/**
 * Per-provider OpenAI-compatible behavior: model keys, JSON mode, and reasoning.
 * Used by OpenAILLM; pure functions are covered by contract tests.
 */
export type OpenAICompatPolicy = {
  providerId: string;
  normalizeModelKey: (modelKey: string) => string;
  /**
   * When true, chat.completions may use response_format: { type: "json_object" }.
   */
  allowsResponseFormatJsonObject: (modelKey: string) => boolean;
  /**
   * For generateObject: prefer API JSON mode vs. plain text + json-repair.
   */
  resolveStructuredOutput: (
    modelKey: string,
    explicit: GenerateOptions['structuredOutput'] | undefined,
  ) => 'json_object' | 'prompt_repair' | 'native_schema';
  /**
   * Extras merged into chat.completions.create (reasoning, DeepSeek extra_body, etc.)
   */
  buildChatCompletionExtras: (args: {
    modelKey: string;
    options: GenerateOptions | undefined;
    hasTools: boolean;
  }) => Record<string, unknown>;
  /**
   * V4 thinking mode may ignore temperature; policy can request stripping.
   */
  shouldOmitTemperatureWhenReasoning: (modelKey: string) => boolean;
};

export const stripModelsPrefix = (name: string): string =>
  name.startsWith('models/') ? name.slice('models/'.length) : name;

export const createDefaultOpenAICompatPolicy = (
  providerId: string,
): OpenAICompatPolicy => ({
  providerId,
  normalizeModelKey: (k) => k,
  allowsResponseFormatJsonObject: () => true,
  resolveStructuredOutput: (_model, explicit) =>
    explicit === 'native_schema' ? 'native_schema' : explicit ?? 'json_object',
  buildChatCompletionExtras: ({ options }) => {
    const out: Record<string, unknown> = {};
    if (options?.reasoning?.effort) {
      out.reasoning_effort = options.reasoning.effort;
    }
    Object.assign(out, options?.providerOptions ?? {});
    return out;
  },
  shouldOmitTemperatureWhenReasoning: () => false,
});

export const createGeminiOpenAICompatPolicy = (): OpenAICompatPolicy => ({
  providerId: 'gemini',
  normalizeModelKey: (k) => stripModelsPrefix(k),
  allowsResponseFormatJsonObject: () => false,
  resolveStructuredOutput: (_model, explicit) => {
    if (explicit === 'native_schema') {
      return 'prompt_repair';
    }
    if (explicit && explicit !== 'json_object') {
      return explicit;
    }
    return 'prompt_repair';
  },
  buildChatCompletionExtras: ({ modelKey, options }) => {
    const out: Record<string, unknown> = {};
    if (options?.reasoning?.effort) {
      out.reasoning_effort = options.reasoning.effort;
    }
    Object.assign(out, options?.providerOptions ?? {});
    return out;
  },
  shouldOmitTemperatureWhenReasoning: () => false,
});

const DEEPSEEK_V4 = /^deepseek-v4-(pro|flash)/i;
const DEEPSEEK_LEGACY = /deepseek-reasoner|deepseek-chat/i;

const isDeepSeekV4Model = (k: string) => DEEPSEEK_V4.test(k);

const mapReasoningMode = (
  options: GenerateOptions | undefined,
  hasTools: boolean,
): { thinkingEnabled: boolean; effort: 'low' | 'high' | 'max' } | null => {
  const preset = options?.reasoningPreset;
  const r = options?.reasoning;
  if (r?.enabled === false || preset === 'off') {
    return { thinkingEnabled: false, effort: 'low' };
  }
  if (preset === 'max' || r?.effort === 'max') {
    return { thinkingEnabled: true, effort: 'max' };
  }
  if (preset === 'high' || r?.effort === 'high' || r?.effort === 'medium') {
    return { thinkingEnabled: true, effort: 'high' };
  }
  if (preset === 'low' || r?.effort === 'low') {
    return { thinkingEnabled: true, effort: 'high' };
  }
  if (preset && preset !== 'auto') {
    return null;
  }
  if (r?.effort) {
    return r.effort === 'max'
      ? { thinkingEnabled: true, effort: 'max' }
      : { thinkingEnabled: true, effort: 'high' };
  }
  return {
    thinkingEnabled: true,
    effort: hasTools ? 'max' : 'high',
  };
};

export const createDeepSeekOpenAICompatPolicy = (): OpenAICompatPolicy => ({
  providerId: 'deepseek',
  normalizeModelKey: (k) => {
    if (k === 'deepseek-chat' || k === 'deepseek-reasoner') return k;
    if (k.includes('/')) return stripModelsPrefix(k);
    return k;
  },
  allowsResponseFormatJsonObject: (modelKey) => {
    if (isDeepSeekV4Model(modelKey)) {
      return false;
    }
    if (DEEPSEEK_LEGACY.test(modelKey)) {
      return true;
    }
    return true;
  },
  resolveStructuredOutput: (modelKey, explicit) => {
    if (explicit && explicit !== 'json_object') {
      return explicit;
    }
    if (isDeepSeekV4Model(modelKey)) {
      return 'prompt_repair';
    }
    return explicit ?? 'json_object';
  },
  buildChatCompletionExtras: ({ modelKey, options, hasTools }) => {
    const out: Record<string, unknown> = {};
    if (!isDeepSeekV4Model(modelKey) && !DEEPSEEK_LEGACY.test(modelKey)) {
      if (options?.reasoning?.effort) {
        out.reasoning_effort = options.reasoning.effort;
      }
      Object.assign(out, options?.providerOptions ?? {});
      return out;
    }
    if (isDeepSeekV4Model(modelKey)) {
      const m = mapReasoningMode(options, hasTools);
      if (m) {
        if (m.thinkingEnabled) {
          (out as Record<string, unknown>).thinking = { type: 'enabled' };
          out.reasoning_effort = m.effort;
        } else {
          (out as Record<string, unknown>).thinking = { type: 'disabled' };
        }
      } else {
        (out as Record<string, unknown>).thinking = { type: 'disabled' };
      }
    }
    Object.assign(out, options?.providerOptions ?? {});
    return out;
  },
  shouldOmitTemperatureWhenReasoning: (modelKey) => isDeepSeekV4Model(modelKey),
});
