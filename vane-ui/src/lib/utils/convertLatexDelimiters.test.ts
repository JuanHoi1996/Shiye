import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  convertLatexDelimitersToTags,
  formulaFromTexAttr,
  looksLikeMath,
  replaceCitationsOutsideLatex,
} from './convertLatexDelimiters';

function texFrom(html: string): string {
  const m = html.match(/\btex="([^"]*)"/);
  assert.ok(m, `expected tex attr in: ${html}`);
  return formulaFromTexAttr(m[1], '');
}

test('currency $100 is not converted', () => {
  const s = convertLatexDelimitersToTags('The price is $100 today.');
  assert.equal(s.includes('<latex'), false);
  assert.equal(s.includes('$100'), true);
});

test('two dollar amounts on one line stay prose', () => {
  const s = convertLatexDelimitersToTags('From $100 to $200 per share.');
  assert.equal(s.includes('<latex'), false);
});

test('inline $math$ still converts', () => {
  const s = convertLatexDelimitersToTags('Let $x^2$ be the square.');
  assert.equal(texFrom(s), 'x^2');
});

test('\\% survives wrapping (KaTeX percent, not markdown escape)', () => {
  const src = '<latex>\n31\\% = r_f + 1.5\\lambda_1 + 2\\lambda_2\n</latex>';
  const s = convertLatexDelimitersToTags(src);
  assert.equal(texFrom(s).trim(), '31\\% = r_f + 1.5\\lambda_1 + 2\\lambda_2');
});

test('subscript star P^* is preserved in tex attr', () => {
  const src =
    '<latex>\nU_C(y) = r_f + y\\left[E(r_{P^*}) - r_f\\right]\n</latex>';
  const s = convertLatexDelimitersToTags(src);
  assert.equal(texFrom(s).includes('r_{P^*}'), true);
});

test('code fences are not converted', () => {
  const s = convertLatexDelimitersToTags('```\n$x^2$\n```');
  assert.equal(s, '```\n$x^2$\n```');
});

test('citations skip latex even with tex attr', () => {
  const converted = convertLatexDelimitersToTags(
    'See <latex>x \\in [0,1]</latex> and [1].',
  );
  const out = replaceCitationsOutsideLatex(converted, /\[(\d+)\]/g, (_, n) => `<c>${n}</c>`);
  assert.equal(out.includes('<c>1</c>'), true);
  assert.equal(texFrom(out).includes('[0,1]'), true);
  assert.equal(out.includes('<c>0</c>'), false);
});

test('looksLikeMath rejects bare numbers', () => {
  assert.equal(looksLikeMath('100'), false);
  assert.equal(looksLikeMath('1,234.56'), false);
  assert.equal(looksLikeMath('x^2'), true);
  assert.equal(looksLikeMath('\\lambda'), true);
});
