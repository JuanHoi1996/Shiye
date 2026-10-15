import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyKimiReasoningExtras,
  omitKimiSamplingParams,
} from './kimiCompat';
import { createDefaultOpenAICompatPolicy } from '../policy/openaiCompatPolicy';

test('Kimi requests omit fixed sampling fields', () => {
  const params: Record<string, unknown> = {
    temperature: 1,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_completion_tokens: 2048,
  };
  omitKimiSamplingParams('kimi-k2.6', params);
  assert.equal('temperature' in params, false);
  assert.equal('top_p' in params, false);
  assert.equal(params.max_completion_tokens, 2048);
  const other = { temperature: 1 };
  omitKimiSamplingParams('gpt-4o', other);
  assert.equal(other.temperature, 1);
});

test('kimi-k2.6 off uses thinking disabled, not reasoning_effort none', () => {
  const p = createDefaultOpenAICompatPolicy('openai');
  const ex = p.buildChatCompletionExtras({
    modelKey: 'kimi-k2.6',
    options: { reasoningPreset: 'off' },
    hasTools: false,
  });
  assert.equal('reasoning_effort' in ex, false);
  assert.deepEqual(ex.thinking, { type: 'disabled' });
});

test('kimi-k3 cannot turn thinking off; off maps to low', () => {
  const p = createDefaultOpenAICompatPolicy('openai');
  const ex = p.buildChatCompletionExtras({
    modelKey: 'kimi-k3',
    options: { reasoningPreset: 'off' },
    hasTools: false,
  });
  assert.equal(ex.reasoning_effort, 'low');
  assert.equal('thinking' in ex, false);
});

test('kimi-k3 max stays max', () => {
  const out: Record<string, unknown> = { reasoning_effort: 'xhigh' };
  applyKimiReasoningExtras('kimi-k3', out);
  assert.equal(out.reasoning_effort, 'max');
});
