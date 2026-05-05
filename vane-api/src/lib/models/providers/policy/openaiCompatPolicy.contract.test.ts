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

test('DeepSeek V4 disables json_object; legacy chat allows', () => {
  const p = createDeepSeekOpenAICompatPolicy();
  assert.equal(p.allowsResponseFormatJsonObject('deepseek-v4-pro'), false);
  assert.equal(
    p.resolveStructuredOutput('deepseek-v4-pro', undefined),
    'prompt_repair',
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
