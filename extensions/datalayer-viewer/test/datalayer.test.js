import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  eventNameOf,
  describeEntry,
  annotate,
  summarize,
  flatten,
  matches,
  filterEntries,
  toJson,
} from '../src/lib/datalayer.js';

// --- eventNameOf -------------------------------------------------------------

test('GTM objects expose their event name', () => {
  assert.equal(eventNameOf({ event: 'purchase', value: 10 }), 'purchase');
  assert.equal(eventNameOf({ event: '' }), null);
  assert.equal(eventNameOf({ value: 10 }), null);
});

test('gtag arrays expose their command or event name', () => {
  // Both shapes really do coexist in one dataLayer.
  assert.equal(eventNameOf(['event', 'purchase', { value: 10 }]), 'purchase');
  assert.equal(eventNameOf(['config', 'G-ABC123']), 'config');
  assert.equal(eventNameOf(['consent', 'default', {}]), 'consent');
  assert.equal(eventNameOf(['js', new Date(0)]), 'js');
});

test('eventNameOf tolerates junk', () => {
  assert.equal(eventNameOf(null), null);
  assert.equal(eventNameOf('string'), null);
  assert.equal(eventNameOf(42), null);
  assert.equal(eventNameOf([]), null);
  assert.equal(eventNameOf([123]), null);
});

test('an event array without a name falls back to the command', () => {
  assert.equal(eventNameOf(['event']), 'event');
  assert.equal(eventNameOf(['event', 42]), 'event');
});

// --- describeEntry -----------------------------------------------------------

test('describeEntry prefers the event name, then the keys', () => {
  assert.equal(describeEntry({ event: 'login' }), 'login');
  assert.equal(describeEntry({ a: 1, b: 2 }), 'a, b');
  assert.equal(describeEntry({ a: 1, b: 2, c: 3, d: 4 }), 'a, b, c, …');
  assert.equal(describeEntry({}), 'empty object');
  assert.equal(describeEntry([1, 2, 3]), 'array(3)');
});

// --- annotate and summarize --------------------------------------------------

const entries = [
  { 'gtm.start': 1700000000000, event: 'gtm.js' },
  { event: 'page_view', page: { path: '/home', title: 'Home' } },
  ['config', 'G-ABC123'],
  { event: 'page_view', page: { path: '/about' } },
  { ecommerce: { items: [] } },
];

test('annotate numbers entries and names their events', () => {
  const annotated = annotate(entries);
  assert.equal(annotated.length, 5);
  assert.deepEqual(
    annotated.map((e) => e.event),
    ['gtm.js', 'page_view', 'config', 'page_view', null]
  );
  assert.equal(annotated[0].index, 0);
  assert.equal(annotated[4].label, 'ecommerce');
});

test('annotate rejects a non-array', () => {
  assert.throws(() => annotate(null), TypeError);
  assert.throws(() => annotate({}), TypeError);
});

test('summarize counts entries and ranks events by frequency', () => {
  const summary = summarize(annotate(entries));
  assert.equal(summary.total, 5);
  assert.equal(summary.events, 4);
  assert.equal(summary.unnamed, 1);
  assert.deepEqual(summary.counts[0], ['page_view', 2]);
  assert.equal(summary.counts.length, 3);
});

test('equally frequent events are ordered alphabetically, so the list is stable', () => {
  const summary = summarize(annotate([{ event: 'zebra' }, { event: 'alpha' }]));
  assert.deepEqual(summary.counts, [['alpha', 1], ['zebra', 1]]);
});

test('summarize tolerates junk', () => {
  assert.equal(summarize(null).total, 0);
  assert.deepEqual(summarize([]).counts, []);
});

// --- flatten -----------------------------------------------------------------

test('flatten produces one path per leaf', () => {
  assert.deepEqual(flatten({ a: 1, b: { c: 'x' } }), [
    { path: 'a', value: '1' },
    { path: 'b.c', value: 'x' },
  ]);
});

test('flatten indexes array elements', () => {
  assert.deepEqual(flatten({ items: ['a', 'b'] }), [
    { path: 'items[0]', value: 'a' },
    { path: 'items[1]', value: 'b' },
  ]);
});

test('flatten marks empty containers rather than dropping them', () => {
  assert.deepEqual(flatten({ a: [], b: {} }), [
    { path: 'a', value: '[]' },
    { path: 'b', value: '{}' },
  ]);
});

test('flatten stops at a depth limit instead of recursing forever', () => {
  let deep = 'leaf';
  for (let i = 0; i < 40; i++) deep = { next: deep };
  const pairs = flatten(deep);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].value, '[Depth limit]');
});

test('flatten renders null and undefined as text', () => {
  assert.deepEqual(flatten({ a: null, b: undefined }), [
    { path: 'a', value: 'null' },
    { path: 'b', value: 'undefined' },
  ]);
});

// --- Search ------------------------------------------------------------------

test('search matches the event name, keys and values', () => {
  const [, pageView] = annotate(entries);
  assert.equal(matches(pageView, 'page_view'), true);
  assert.equal(matches(pageView, 'PAGE'), true);
  assert.equal(matches(pageView, 'title'), true);
  assert.equal(matches(pageView, '/home'), true);
  assert.equal(matches(pageView, 'checkout'), false);
});

test('an empty search matches everything', () => {
  const annotated = annotate(entries);
  assert.equal(matches(annotated[0], ''), true);
  assert.equal(matches(annotated[0], '   '), true);
});

test('matches tolerates a missing entry', () => {
  assert.equal(matches(null, 'x'), false);
});

test('filterEntries combines the event filter and the search box', () => {
  const annotated = annotate(entries);
  assert.equal(filterEntries(annotated, {}).length, 5);
  assert.equal(filterEntries(annotated, { event: 'page_view' }).length, 2);
  assert.equal(filterEntries(annotated, { query: '/about' }).length, 1);
  assert.equal(filterEntries(annotated, { event: 'page_view', query: '/about' }).length, 1);
  assert.equal(filterEntries(annotated, { event: 'page_view', query: 'nothing' }).length, 0);
});

test('filterEntries rejects a non-array', () => {
  assert.throws(() => filterEntries(null), TypeError);
});

// --- Export ------------------------------------------------------------------

test('toJson produces parseable JSON with the capture metadata', () => {
  const parsed = JSON.parse(
    toJson({
      url: 'https://example.com/',
      collectedAt: '2026-09-19T10:00:00.000Z',
      containers: ['GTM-ABC'],
      layers: [{ name: 'dataLayer', total: 2, entries: [{ event: 'a' }] }],
    })
  );

  assert.equal(parsed.tool, 'DataLayer Viewer');
  assert.equal(parsed.url, 'https://example.com/');
  assert.deepEqual(parsed.containers, ['GTM-ABC']);
  assert.equal(parsed.layers[0].entries[0].event, 'a');
});

test('toJson rejects junk', () => {
  assert.throws(() => toJson(null), TypeError);
  assert.throws(() => toJson('nope'), TypeError);
});
