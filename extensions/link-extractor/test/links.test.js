import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyLink,
  isNofollow,
  linkLabel,
  annotate,
  filterLinks,
  summarize,
  toRows,
  toPlainList,
  CSV_HEADER,
  SCOPES,
} from '../src/lib/links.js';

const ORIGIN = 'https://example.com';

const link = (raw, extra = {}) => ({
  raw,
  href: (() => {
    try {
      return new URL(raw, ORIGIN + '/page').href;
    } catch {
      return null;
    }
  })(),
  text: '',
  ariaLabel: '',
  imageAlt: '',
  title: '',
  rel: '',
  target: '',
  ...extra,
});

// --- classifyLink ------------------------------------------------------------

test('same-origin links are internal', () => {
  assert.equal(classifyLink(link('/about'), ORIGIN), 'internal');
  assert.equal(classifyLink(link('https://example.com/x'), ORIGIN), 'internal');
  assert.equal(classifyLink(link('page.html'), ORIGIN), 'internal');
});

test('other origins are external', () => {
  assert.equal(classifyLink(link('https://other.test/'), ORIGIN), 'external');
  assert.equal(classifyLink(link('http://example.com/'), ORIGIN), 'external'); // scheme differs
  assert.equal(classifyLink(link('https://sub.example.com/'), ORIGIN), 'external');
});

test('a lookalike origin is not mistaken for internal', () => {
  // The bug prefix matching would cause.
  assert.equal(classifyLink(link('https://example.com.evil.test/'), ORIGIN), 'external');
});

test('non-navigational schemes get their own category', () => {
  assert.equal(classifyLink(link('#section'), ORIGIN), 'anchor');
  assert.equal(classifyLink(link('mailto:a@b.test'), ORIGIN), 'mailto');
  assert.equal(classifyLink(link('MAILTO:a@b.test'), ORIGIN), 'mailto');
  assert.equal(classifyLink(link('tel:+33100000000'), ORIGIN), 'tel');
  assert.equal(classifyLink(link('javascript:void(0)'), ORIGIN), 'script');
  assert.equal(classifyLink(link('ftp://files.test/'), ORIGIN), 'other');
});

test('classifyLink survives unresolvable or missing input', () => {
  assert.equal(classifyLink({ raw: 'http://[bad', href: null }, ORIGIN), 'other');
  assert.equal(classifyLink({}, ORIGIN), 'other');
  assert.equal(classifyLink(null, ORIGIN), 'other');
});

test('classifyLink degrades to external when the page origin is unusable', () => {
  assert.equal(classifyLink(link('https://other.test/'), 'not an origin'), 'external');
});

// --- Labels and rel ----------------------------------------------------------

test('isNofollow matches the token, not the substring', () => {
  assert.equal(isNofollow({ rel: 'nofollow' }), true);
  assert.equal(isNofollow({ rel: 'noopener nofollow' }), true);
  assert.equal(isNofollow({ rel: 'NOFOLLOW' }), true);
  assert.equal(isNofollow({ rel: 'nofollowing' }), false);
  assert.equal(isNofollow({ rel: '' }), false);
  assert.equal(isNofollow({}), false);
});

test('linkLabel falls back through text, aria-label, image alt and title', () => {
  assert.equal(linkLabel({ text: 'Read more' }), 'Read more');
  assert.equal(linkLabel({ text: '', ariaLabel: 'Close' }), 'Close');
  assert.equal(linkLabel({ text: '', ariaLabel: '', imageAlt: 'Logo' }), 'Logo');
  assert.equal(linkLabel({ text: '', ariaLabel: '', imageAlt: '', title: 'Home' }), 'Home');
  assert.equal(linkLabel({ text: '', ariaLabel: '', imageAlt: '', title: '' }), '');
  assert.equal(linkLabel(null), '');
});

// --- annotate ----------------------------------------------------------------

const page = {
  url: ORIGIN + '/page',
  origin: ORIGIN,
  links: [
    link('/about', { text: 'About' }),
    link('https://other.test/', { text: 'Partner', rel: 'nofollow noopener' }),
    link('#top'),
    link('/contact', { text: 'Contact' }),
    link('/about', { text: 'About again' }),
  ],
};

test('annotate adds kind, label and nofollow to every link', () => {
  const links = annotate(page);
  assert.equal(links.length, 5);
  assert.deepEqual(
    links.map((l) => l.kind),
    ['internal', 'external', 'anchor', 'internal', 'internal']
  );
  assert.equal(links[1].nofollow, true);
  assert.equal(links[2].label, '');
});

test('annotate rejects malformed input', () => {
  assert.throws(() => annotate(null), TypeError);
  assert.throws(() => annotate({}), TypeError);
});

// --- filterLinks -------------------------------------------------------------

test('every declared scope filters without throwing', () => {
  const links = annotate(page);
  for (const scope of SCOPES) {
    assert.ok(Array.isArray(filterLinks(links, { scope: scope.id })), scope.id);
  }
});

test('scope narrows to one category', () => {
  const links = annotate(page);
  assert.equal(filterLinks(links, { scope: 'internal' }).length, 3);
  assert.equal(filterLinks(links, { scope: 'external' }).length, 1);
  assert.equal(filterLinks(links, { scope: 'anchor' }).length, 1);
  assert.equal(filterLinks(links, { scope: 'nofollow' }).length, 1);
  assert.equal(filterLinks(links, { scope: 'untitled' }).length, 1);
  assert.equal(filterLinks(links, { scope: 'all' }).length, 5);
});

test('the search box matches both the URL and the link text', () => {
  const links = annotate(page);
  assert.equal(filterLinks(links, { query: 'contact' }).length, 1);
  assert.equal(filterLinks(links, { query: 'ABOUT' }).length, 2);
  assert.equal(filterLinks(links, { query: 'partner' }).length, 1);
  assert.equal(filterLinks(links, { query: 'nothing here' }).length, 0);
});

test('dedupe keeps the first link per URL', () => {
  const links = annotate(page);
  const deduped = filterLinks(links, { dedupe: true });
  assert.equal(deduped.length, 4);
  assert.equal(deduped.find((l) => l.href.endsWith('/about')).text, 'About');
});

test('scope, query and dedupe combine', () => {
  const links = annotate(page);
  const result = filterLinks(links, { scope: 'internal', query: 'about', dedupe: true });
  assert.equal(result.length, 1);
});

test('filterLinks rejects a non-array', () => {
  assert.throws(() => filterLinks(null), TypeError);
});

// --- summarize ---------------------------------------------------------------

test('summarize counts categories, nofollow and unlabelled links', () => {
  const summary = summarize(annotate(page));
  assert.equal(summary.total, 5);
  assert.equal(summary.internal, 3);
  assert.equal(summary.external, 1);
  assert.equal(summary.anchor, 1);
  assert.equal(summary.nofollow, 1);
  assert.equal(summary.untitled, 1);
});

test('summarize tolerates junk', () => {
  assert.equal(summarize(null).total, 0);
  assert.equal(summarize([{ kind: 'nonsense', label: 'x' }]).other, 0);
});

// --- Export shaping ----------------------------------------------------------

test('toRows emits a header followed by one row per link', () => {
  const rows = toRows(annotate(page));
  assert.deepEqual(rows[0], [...CSV_HEADER]);
  assert.equal(rows.length, 6);
  assert.equal(rows[1][0], ORIGIN + '/about');
  assert.equal(rows[1][1], 'About');
  assert.equal(rows[1][2], 'internal');
  assert.equal(rows[2][5], 'yes');
  assert.equal(rows[1][5], 'no');
});

test('every row has the same width as the header', () => {
  for (const row of toRows(annotate(page))) {
    assert.equal(row.length, CSV_HEADER.length);
  }
});

test('toPlainList emits one URL per line', () => {
  const list = toPlainList(annotate(page)).split('\n');
  assert.equal(list.length, 5);
  assert.equal(list[0], ORIGIN + '/about');
});

test('export helpers reject a non-array', () => {
  assert.throws(() => toRows(null), TypeError);
  assert.throws(() => toPlainList(null), TypeError);
});

test('an empty page produces just the header and an empty list', () => {
  const empty = annotate({ origin: ORIGIN, links: [] });
  assert.equal(toRows(empty).length, 1);
  assert.equal(toPlainList(empty), '');
});
