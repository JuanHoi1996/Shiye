import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDeepSeekOpenAICompatPolicy,
  createGeminiOpenAICompatPolicy,
  createDefaultOpenAICompatPolicy,
  stripModelsPrefix,
} from './openaiCompatPolicy';
import { normalizeDeepSeekOpenAIBaseURL } from '../deepseek/baseUrl';

test('normalizeDeepSeekOpenAIBaseURL strips legacy /v1 on official host', () => {
  assert.equal(
    normalizeDeepSeekOpenAIBaseURL('https://api.deepseek.com/v1'),
    'https://api.deepseek.com',
  );
  assert.equal(
    normalizeDeepSeekOpenAIBaseURL('https://api.deepseek.com'),
    'https://api.deepseek.com',
  );
  assert.equal(
    normalizeDeepSeekOpenAIBaseURL('https://api.openai.com/v1'),
    'https://api.openai.com/v1',
  );
});

test('stripModelsPrefix removes models/ prefix', () => {
  assert.equal(stripModelsPrefix('models/gemini-2.0-flash'), 'gemini-2.0-flash');
  assert.equal(stripModelsPrefix('gemini-2.0-flash'), 'gemini-2.0-flash');
});

test('Gemini policy normalizes keys and disables json_object', () => {
  const p = createGeminiOpenAICompatPolicy();
  assert.equal(
    p.normalizeModelKey('models/gemini-2.5-pro'),
    'gemini-2.5-pro',
  );
  assert.equal(p.allowsResponseFormatJsonObject('x'), false);
  assert.equal(
    p.resolveStructuredOutput('models/x', undefined),
    'prompt_repair',
  );
});

test('Default OpenAI policy allows json_object', () => {
  const p = createDefaultOpenAICompatPolicy('openai');
  assert.equal(p.allowsResponseFormatJsonObject('gpt-4o'), true);
  assert.equal(p.resolveStructuredOutput('gpt-4o', undefined), 'json_object');
});

test('OpenAI gpt-5.6 + tools forces reasoning_effort none', () => {
  const p = createDefaultOpenAICompatPolicy('openai');
  for (const modelKey of [
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'GPT-5.6',
  ]) {
    const ex = p.buildChatCompletionExtras({
      modelKey,
      options: { reasoningPreset: 'max' },
      hasTools: true,
    });
    assert.equal(
      (ex as { reasoning_effort?: string }).reasoning_effort,
      'none',
      modelKey,
    );
  }
});

test('OpenAI gpt-5.6 without tools maps max preset to xhigh', () => {
  const p = createDefaultOpenAICompatPolicy('openai');
  const ex = p.buildChatCompletionExtras({
    modelKey: 'gpt-5.6-luna',
    options: { reasoningPreset: 'max' },
    hasTools: false,
  });
  assert.equal((ex as { reasoning_effort?: string }).reasoning_effort, 'xhigh');
});

test('OpenAI maps reasoning.effort max to xhigh', () => {
  const p = createDefaultOpenAICompatPolicy('openai');
  const ex = p.buildChatCompletionExtras({
    modelKey: 'gpt-4o',
    options: { reasoning: { effort: 'max' } },
    hasTools: false,
  });
  assert.equal((ex as { reasoning_effort?: string }).reasoning_effort, 'xhigh');
});

test('OpenAI non-5.6 + tools does not force none', () => {
  const p = createDefaultOpenAICompatPolicy('openai');
  const ex = p.buildChatCompletionExtras({
    modelKey: 'gpt-4o',
    options: { reasoning: { effort: 'high' } },
    hasTools: true,
  });
  assert.equal((ex as { reasoning_effort?: string }).reasoning_effort, 'high');
});

test('DeepSeek V4 allows json_object; legacy chat allows', () => {
  const p = createDeepSeekOpenAICompatPolicy();
  assert.equal(p.allowsResponseFormatJsonObject('deepseek-v4-pro'), true);
  assert.equal(p.allowsResponseFormatJsonObject('deepseek-v4-flash'), true);
  assert.equal(
    p.resolveStructuredOutput('deepseek-v4-pro', undefined),
    'json_object',
  );
  assert.equal(
    p.resolveStructuredOutput('deepseek-v4-flash', 'json_object'),
    'json_object',
  );
  assert.equal(p.allowsResponseFormatJsonObject('deepseek-chat'), true);
});

test('DeepSeek V4 Auto + tools enables thinking with max effort', () => {
  const p = createDeepSeekOpenAICompatPolicy();
  const ex = p.buildChatCompletionExtras({
    modelKey: 'deepseek-v4-pro',
    options: { reasoningPreset: 'auto' },
    hasTools: true,
  });
  assert.deepEqual((ex as { thinking?: unknown }).thinking, {
    type: 'enabled',
  });
  assert.equal((ex as { reasoning_effort?: string }).reasoning_effort, 'max');
});

test('DeepSeek V4 Auto + no tools enables thinking with high effort', () => {
  const p = createDeepSeekOpenAICompatPolicy();
  const ex = p.buildChatCompletionExtras({
    modelKey: 'deepseek-v4-pro',
    options: { reasoningPreset: 'auto' },
    hasTools: false,
  });
  assert.equal((ex as { reasoning_effort?: string }).reasoning_effort, 'high');
  assert.deepEqual((ex as { thinking?: unknown }).thinking, {
    type: 'enabled',
  });
});
