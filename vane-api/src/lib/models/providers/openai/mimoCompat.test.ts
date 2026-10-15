import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowsStreamUsageOption,
  clampMiMoReasoningEffort,
  isXiaomiMiMoTarget,
  toolParametersForProvider,
} from './mimoCompat';

test('MiMo is detected by host or model id', () => {
  assert.equal(
    isXiaomiMiMoTarget('https://api.xiaomimimo.com/v1', 'other'),
    true,
  );
  assert.equal(isXiaomiMiMoTarget('https://api.openai.com/v1', 'mimo-v2.6-flash'), true);
  assert.equal(isXiaomiMiMoTarget('https://api.openai.com/v1', 'gpt-4o'), false);
});

test('MiMo clamps max and xhigh reasoning effort to high', () => {
  assert.equal(clampMiMoReasoningEffort('mimo-v2.6-flash', 'xhigh'), 'high');
  assert.equal(clampMiMoReasoningEffort('mimo-v2.6-flash', 'max'), 'high');
  assert.equal(clampMiMoReasoningEffort('mimo-v2.6-flash', 'low'), 'low');
  assert.equal(clampMiMoReasoningEffort('gpt-5.6-luna', 'xhigh'), 'xhigh');
});

test('MiMo does not send stream_options', () => {
  assert.equal(allowsStreamUsageOption('https://api.xiaomimimo.com/v1', 'mimo-v2.6-flash'), false);
  assert.equal(allowsStreamUsageOption('https://api.openai.com/v1', 'gpt-4o'), true);
});

test('MiMo tool schema drops $schema and rewrites const to enum', () => {
  const cleaned = toolParametersForProvider(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        type: { type: 'string', const: 'web_search' },
      },
    },
    true,
  );
  assert.equal('$schema' in cleaned, false);
  assert.deepEqual(cleaned.properties, {
    type: { type: 'string', enum: ['web_search'] },
  });
});
