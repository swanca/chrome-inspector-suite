import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, renderBlocks, renderInline, escapeText } from '../src/lib/markdown.js';

const text = (value) => ({ type: 'text', text: value });
const para = (...children) => ({ type: 'paragraph', children });
const heading = (level, value) => ({ type: 'heading', level, children: [text(value)] });

// --- escapeText --------------------------------------------------------------

test('escapeText neutralises inline Markdown syntax', () => {
  assert.equal(escapeText('a*b'), 'a\\*b');
  assert.equal(escapeText('snake_case_name'), 'snake\\_case\\_name');
  assert.equal(escapeText('[bracket]'), '\\[bracket\\]');
  assert.equal(escapeText('back\\slash'), 'back\\\\slash');
  assert.equal(escapeText('a `tick`'), 'a \\`tick\\`');
  assert.equal(escapeText('<tag>'), '\\<tag\\>');
});

test('escapeText neutralises line-leading syntax only at the start', () => {
  assert.equal(escapeText('- not a list'), '\\- not a list');
  assert.equal(escapeText('1. not a list'), '1\\. not a list');
  assert.equal(escapeText('# not a heading'), '\\# not a heading');
  assert.equal(escapeText('> not a quote'), '\\> not a quote');
  assert.equal(escapeText('a - b'), 'a - b');
});

test('escapeText tolerates null and undefined', () => {
  assert.equal(escapeText(null), '');
  assert.equal(escapeText(undefined), '');
});

// --- renderInline ------------------------------------------------------------

test('renderInline collapses whitespace like HTML does', () => {
  assert.equal(renderInline([text('a   \n  b')]), 'a b');
});

test('renderInline renders emphasis, strong and strikethrough', () => {
  assert.equal(renderInline([{ type: 'strong', children: [text('bold')] }]), '**bold**');
  assert.equal(renderInline([{ type: 'em', children: [text('it')] }]), '*it*');
  assert.equal(renderInline([{ type: 'strike', children: [text('old')] }]), '~~old~~');
});

test('renderInline drops emphasis that wraps nothing', () => {
  assert.equal(renderInline([{ type: 'strong', children: [text('   ')] }]), '');
});

test('renderInline renders links and can strip them', () => {
  const link = { type: 'link', href: 'https://a.test/x', children: [text('here')] };
  assert.equal(renderInline([link]), '[here](https://a.test/x)');
  assert.equal(renderInline([link], { links: false }), 'here');
});

test('renderInline keeps the text of a link that has no href', () => {
  assert.equal(renderInline([{ type: 'link', href: '', children: [text('bare')] }]), 'bare');
});

test('renderInline wraps URLs containing parentheses or spaces', () => {
  const link = { type: 'link', href: 'https://a.test/a(b)', children: [text('x')] };
  assert.equal(renderInline([link]), '[x](<https://a.test/a(b)>)');
});

test('renderInline renders images and can strip them', () => {
  const image = { type: 'image', src: 'https://a.test/i.png', alt: 'Logo' };
  assert.equal(renderInline([image]), '![Logo](https://a.test/i.png)');
  assert.equal(renderInline([image], { images: false }), '');
});

test('renderInline widens the fence for code containing backticks', () => {
  assert.equal(renderInline([{ type: 'code', text: 'a' }]), '`a`');
  assert.equal(renderInline([{ type: 'code', text: 'a ` b' }]), '``a ` b``');
  assert.equal(renderInline([{ type: 'code', text: '`x`' }]), '`` `x` ``');
});

test('renderInline does not escape inside code', () => {
  assert.equal(renderInline([{ type: 'code', text: 'a*b_c' }]), '`a*b_c`');
});

test('renderInline turns <br> into a hard line break', () => {
  assert.equal(renderInline([text('a'), { type: 'br' }, text('b')]), 'a  \nb');
});

test('renderInline tolerates junk', () => {
  assert.equal(renderInline(null), '');
  assert.equal(renderInline([null, undefined, { type: 'unknown' }]), '');
});

// --- Blocks ------------------------------------------------------------------

test('headings render at their level and are clamped to 1-6', () => {
  assert.equal(renderBlocks([heading(2, 'Title')]), '## Title');
  assert.equal(renderBlocks([heading(9, 'Deep')]), '###### Deep');
  assert.equal(renderBlocks([heading(0, 'Shallow')]), '# Shallow');
});

test('blocks are separated by exactly one blank line', () => {
  assert.equal(renderBlocks([para(text('one')), para(text('two'))]), 'one\n\ntwo');
});

test('empty blocks are dropped rather than leaving holes', () => {
  assert.equal(renderBlocks([para(text('  ')), para(text('kept'))]), 'kept');
});

test('a horizontal rule renders as three dashes', () => {
  assert.equal(renderBlocks([{ type: 'hr' }]), '---');
});

// --- Code blocks -------------------------------------------------------------

test('code blocks keep their language and their contents verbatim', () => {
  const block = { type: 'code-block', lang: 'js', text: 'const a = 1;\nif (a) b();' };
  assert.equal(renderBlocks([block]), '```js\nconst a = 1;\nif (a) b();\n```');
});

test('a code block containing a fence gets a longer fence', () => {
  const block = { type: 'code-block', lang: '', text: 'text\n```\nmore' };
  const out = renderBlocks([block]);
  assert.ok(out.startsWith('````'));
  assert.ok(out.endsWith('````'));
  assert.ok(out.includes('```\nmore'));
});

test('an empty code block is dropped', () => {
  assert.equal(renderBlocks([{ type: 'code-block', text: '   ' }]), '');
});

// --- Lists -------------------------------------------------------------------

const listOf = (ordered, ...items) => ({
  type: 'list',
  ordered,
  start: 1,
  items: items.map((value) => ({ blocks: [para(text(value))] })),
});

test('unordered lists use dashes', () => {
  assert.equal(renderBlocks([listOf(false, 'a', 'b')]), '- a\n- b');
});

test('ordered lists number from their start attribute', () => {
  const list = listOf(true, 'a', 'b');
  assert.equal(renderBlocks([list]), '1. a\n2. b');

  list.start = 5;
  assert.equal(renderBlocks([list]), '5. a\n6. b');
});

test('nested lists are indented under their parent item', () => {
  const nested = {
    type: 'list',
    ordered: false,
    items: [
      { blocks: [para(text('parent')), listOf(false, 'child one', 'child two')] },
      { blocks: [para(text('sibling'))] },
    ],
  };
  assert.equal(
    renderBlocks([nested]),
    '- parent\n  - child one\n  - child two\n- sibling'
  );
});

test('ordered nesting indents by the width of its marker', () => {
  const nested = {
    type: 'list',
    ordered: true,
    start: 1,
    items: [{ blocks: [para(text('step')), listOf(false, 'detail')] }],
  };
  assert.equal(renderBlocks([nested]), '1. step\n   - detail');
});

test('a multi-paragraph list item keeps its blank line and its indentation', () => {
  const list = {
    type: 'list',
    ordered: false,
    items: [{ blocks: [para(text('first')), para(text('second'))] }],
  };
  assert.equal(renderBlocks([list]), '- first\n\n  second');
});

test('empty list items are skipped without breaking the numbering', () => {
  const list = {
    type: 'list',
    ordered: true,
    start: 1,
    items: [{ blocks: [para(text('a'))] }, { blocks: [] }, { blocks: [para(text('c'))] }],
  };
  assert.equal(renderBlocks([list]), '1. a\n2. c');
});

// --- Quotes ------------------------------------------------------------------

test('blockquotes prefix every line, blank lines included', () => {
  const quote = { type: 'quote', blocks: [para(text('one')), para(text('two'))] };
  assert.equal(renderBlocks([quote]), '> one\n>\n> two');
});

test('an empty blockquote is dropped', () => {
  assert.equal(renderBlocks([{ type: 'quote', blocks: [] }]), '');
});

// --- Tables ------------------------------------------------------------------

test('tables render with a header separator row', () => {
  const table = { type: 'table', rows: [['a', 'b'], ['1', '2']] };
  assert.equal(renderBlocks([table]), '| a | b |\n| --- | --- |\n| 1 | 2 |');
});

test('pipes inside cells are escaped so columns do not shift', () => {
  const table = { type: 'table', rows: [['a|b'], ['c']] };
  assert.ok(renderBlocks([table]).includes('a\\|b'));
});

test('ragged table rows are padded to the widest row', () => {
  const table = { type: 'table', rows: [['a', 'b', 'c'], ['1']] };
  const lines = renderBlocks([table]).split('\n');
  assert.equal(lines[2], '| 1 |  |  |');
});

test('an empty table is dropped', () => {
  assert.equal(renderBlocks([{ type: 'table', rows: [] }]), '');
});

// --- Figures -----------------------------------------------------------------

test('a figure renders its image and italicised caption', () => {
  const figure = { type: 'figure', src: 'https://a.test/i.png', alt: 'Chart', caption: 'Fig 1' };
  assert.equal(renderBlocks([figure]), '![Chart](https://a.test/i.png)\n\n*Fig 1*');
});

test('figures disappear when images are turned off', () => {
  const figure = { type: 'figure', src: 'https://a.test/i.png', alt: '', caption: 'x' };
  assert.equal(renderBlocks([figure], { images: false }), '');
});

// --- renderMarkdown ----------------------------------------------------------

const doc = (overrides = {}) => ({
  url: 'https://example.com/post',
  title: 'My Post',
  heading: 'My Post',
  description: 'A post.',
  collectedAt: '2026-09-19T10:00:00.000Z',
  blocks: [para(text('Body text.'))],
  ...overrides,
});

test('renderMarkdown leads with the title and ends with a single newline', () => {
  const out = renderMarkdown(doc());
  assert.equal(out, '# My Post\n\nBody text.\n');
});

test('renderMarkdown does not repeat a title the body already opens with', () => {
  const out = renderMarkdown(doc({ blocks: [heading(1, 'My Post'), para(text('Body.'))] }));
  assert.equal(out, '# My Post\n\nBody.\n');
  assert.equal(out.match(/My Post/g).length, 1);
});

test('renderMarkdown emits front matter on request', () => {
  const out = renderMarkdown(doc(), { frontMatter: true });
  assert.ok(out.startsWith('---\ntitle: "My Post"\n'));
  assert.ok(out.includes('source: "https://example.com/post"'));
  assert.ok(out.includes('captured: "2026-09-19T10:00:00.000Z"'));
});

test('front matter escapes quotes in the title', () => {
  const out = renderMarkdown(doc({ heading: 'He said "hi"' }), { frontMatter: true });
  assert.ok(out.includes('title: "He said \\"hi\\""'));
});

test('renderMarkdown never leaves more than one blank line', () => {
  const out = renderMarkdown(
    doc({ blocks: [para(text('a')), { type: 'quote', blocks: [] }, para(text('b'))] })
  );
  assert.equal(/\n{3,}/.test(out), false);
});

test('renderMarkdown returns an empty string for an empty document', () => {
  assert.equal(renderMarkdown({ title: '', heading: '', blocks: [] }), '');
});

test('renderMarkdown rejects a non-object', () => {
  assert.throws(() => renderMarkdown(null), TypeError);
  assert.throws(() => renderMarkdown('nope'), TypeError);
});

test('renderMarkdown passes link and image options all the way down', () => {
  const blocks = [
    para(
      { type: 'link', href: 'https://a.test', children: [text('link')] },
      { type: 'image', src: 'https://a.test/i.png', alt: 'i' }
    ),
  ];
  const out = renderMarkdown(doc({ blocks }), { links: false, images: false });
  assert.ok(out.includes('link'));
  assert.equal(out.includes(']('), false);
});
