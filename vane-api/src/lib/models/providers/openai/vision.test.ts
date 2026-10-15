import assert from 'node:assert/strict';
import test from 'node:test';
import { inferOpenAiCompatVision } from './vision';

test('kimi chat models are treated as vision', () => {
  assert.equal(inferOpenAiCompatVision('kimi-k3'), true);
  assert.equal(inferOpenAiCompatVision('kimi-k2.6'), true);
  assert.equal(inferOpenAiCompatVision('kimi-k2.7-code'), false);
});

test('explicit capabilities.vision overrides the name', () => {
  assert.equal(
    inferOpenAiCompatVision('kimi-k3', { vision: false }),
    false,
  );
  assert.equal(
    inferOpenAiCompatVision('deepseek-chat', { vision: true }),
    true,
  );
});

test('plain text model ids stay non-vision', () => {
  assert.equal(inferOpenAiCompatVision('gpt-4'), false);
  assert.equal(inferOpenAiCompatVision('mimo-v2.6-flash'), false);
});
