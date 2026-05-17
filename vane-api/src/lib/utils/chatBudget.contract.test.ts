import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RESEARCHER_TOOL_STRING,
  sanitizeTruncatedSerializedJson,
  truncateToolContentJson,
} from './chatBudget';

function hasIncompleteTrailingJsonUEscape(text: string): boolean {
  if (/\\u[\da-fA-F]{0,3}$/i.exec(text)?.[0]) return true;
  let backslashesFromEnd = 0;
  for (let j = text.length - 1; j >= 0 && text[j] === '\\'; j--) {
    backslashesFromEnd++;
  }
  return backslashesFromEnd % 2 === 1;
}

test('sanitizeTruncatedSerializedJson removes tail split mid-\\uXXXX in JSON.stringify slices', () => {
  const full = JSON.stringify({ filler: 'a'.repeat(20), blob: '\u0001' });
  const ix = full.indexOf('\\u');
  assert.ok(ix >= 0, 'sanity: expect printable \\u escapes in stringify output');

  const cutBad = full.slice(0, ix + 3);
  assert.ok(
    hasIncompleteTrailingJsonUEscape(cutBad),
    'sanity: cut should emulate budget slice splitting an escape',
  );

  const fixed = sanitizeTruncatedSerializedJson(cutBad);
  assert.ok(!hasIncompleteTrailingJsonUEscape(fixed));

  assert.doesNotThrow(() =>
    JSON.parse(JSON.stringify([{ role: 'user', content: fixed }])),
  );
});

test('truncateToolContentJson never leaves incomplete trailing \\u on the kept prefix', () => {
  const huge = JSON.stringify({
    pad: 'p'.repeat(100),
    blob: '\u0001'.repeat(4000),
  });
  assert.ok(
    huge.length > MAX_RESEARCHER_TOOL_STRING,
    'sanity: payload must exceed per-tool cap',
  );

  const out = truncateToolContentJson(huge);
  const suffix = '…[truncated for context budget]';
  assert.ok(out.endsWith(suffix));

  const head = out.slice(0, -suffix.length);
  assert.ok(!hasIncompleteTrailingJsonUEscape(head));

  assert.doesNotThrow(() =>
    JSON.parse(JSON.stringify([{ role: 'user', content: out }])),
  );
});
