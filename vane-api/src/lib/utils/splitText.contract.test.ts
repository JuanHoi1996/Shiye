import assert from 'node:assert/strict';
import test from 'node:test';

import { splitText } from './splitText';

test('splitText terminates when a single segment exceeds maxTokens (no infinite push loop)', () => {
  // One line so splitRegex does not fragment; explode yields ~512-char slices whose
  // token counts are still > maxTokens=1, which used to leave chunkEnd === chunkStart.
  const chunks = splitText('x'.repeat(3000), 1, 0);
  assert.ok(chunks.length > 0);
  assert.ok(chunks.length < 500, 'sanity: should be a small finite chunk count');
});
