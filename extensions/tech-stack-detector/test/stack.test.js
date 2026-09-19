import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectStack,
  summarize,
  groupByCategory,
  toRows,
  TECHNOLOGIES,
  CATEGORIES,
  CSV_HEADER,
} from '../src/lib/stack.js';

const signals = (overrides = {}) => ({
  url: 'https://example.com/',
  globals: [],
  versions: {},
  markers: [],
  urls: [],
  generator: '',
  htmlClass: '',
  bodyClass: '',
  ...overrides,
});

const idsOf = (detected) => detected.map((item) => item.id).sort();
const find = (detected, id) => detected.find((item) => item.id === id);

// --- Registry integrity ------------------------------------------------------

test('every technology declares a known category and at least one signal', () => {
  const categories = new Set(CATEGORIES.map((category) => category.id));

  for (const technology of TECHNOLOGIES) {
    assert.ok(technology.id, 'technology without an id');
    assert.ok(technology.name, technology.id + ' has no name');
    assert.ok(categories.has(technology.category), technology.id + ': ' + technology.category);

    const signalCount =
      (technology.globals || []).length +
      (technology.markers || []).length +
      (technology.paths || []).length +
      (technology.classes || []).length +
      (technology.generator ? 1 : 0);
    assert.ok(signalCount > 0, technology.id + ' can never be detected');
  }
});

test('technology ids are unique', () => {
  const ids = TECHNOLOGIES.map((technology) => technology.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- Detection ---------------------------------------------------------------

test('a bare page detects nothing', () => {
  assert.deepEqual(detectStack(signals()), []);
});

test('detectStack rejects junk', () => {
  assert.throws(() => detectStack(null), TypeError);
  assert.throws(() => detectStack('nope'), TypeError);
});

test('a global identifies a framework', () => {
  const detected = detectStack(signals({ globals: ['React'] }));
  assert.deepEqual(idsOf(detected), ['react']);
});

test('a DOM marker identifies a framework without any global', () => {
  const detected = detectStack(signals({ markers: ['data-reactroot'] }));
  assert.deepEqual(idsOf(detected), ['react']);
});

test('a resource path identifies a technology', () => {
  const detected = detectStack(signals({ urls: ['https://example.com/_next/static/app.js'] }));
  assert.deepEqual(idsOf(detected), ['next']);
});

test('path matching is case-insensitive', () => {
  const detected = detectStack(signals({ urls: ['https://EXAMPLE.com/WP-CONTENT/themes/x.css'] }));
  assert.deepEqual(idsOf(detected), ['wordpress']);
});

test('the generator meta tag identifies a CMS', () => {
  const detected = detectStack(signals({ generator: 'WordPress 6.5.2' }));
  assert.deepEqual(idsOf(detected), ['wordpress']);
  assert.match(find(detected, 'wordpress').evidence[0], /generator/);
});

test('a generator that matches nothing is ignored', () => {
  assert.deepEqual(detectStack(signals({ generator: 'Some Bespoke Thing 1.0' })), []);
});

// --- Versions ----------------------------------------------------------------

test('a known version is attached to its technology', () => {
  const detected = detectStack(signals({ globals: ['React'], versions: { react: '18.2.0' } }));
  assert.equal(find(detected, 'react').version, '18.2.0');
});

test('a missing version leaves an empty string, never "undefined"', () => {
  const detected = detectStack(signals({ globals: ['React'] }));
  assert.equal(find(detected, 'react').version, '');
});

test('technologies with no version field never claim one', () => {
  const detected = detectStack(signals({ globals: ['Ember'], versions: { react: '18.2.0' } }));
  assert.equal(find(detected, 'ember').version, '');
});

// --- Confidence --------------------------------------------------------------

test('one signal is low confidence, several is high', () => {
  const weak = detectStack(signals({ globals: ['React'] }));
  assert.equal(find(weak, 'react').confidence, 'low');

  const strong = detectStack(signals({ globals: ['React'], markers: ['data-reactroot'] }));
  assert.equal(find(strong, 'react').confidence, 'high');
  assert.equal(find(strong, 'react').evidence.length, 2);
});

// --- Conflicts ---------------------------------------------------------------

test('Angular and AngularJS are not both reported when the modern one is certain', () => {
  // window.angular exists in some Angular 2+ apps too, so the ng-version
  // attribute has to break the tie.
  const detected = detectStack(
    signals({ globals: ['angular', 'getAllAngularRootElements'], markers: ['ng-version'] })
  );
  assert.ok(idsOf(detected).includes('angular'));
  assert.equal(idsOf(detected).includes('angularjs'), false);
});

test('AngularJS alone is still reported', () => {
  const detected = detectStack(signals({ globals: ['angular'], markers: ['angularjs'] }));
  assert.deepEqual(idsOf(detected), ['angularjs']);
});

// --- A realistic page --------------------------------------------------------

test('a typical Next.js site is identified end to end', () => {
  const detected = detectStack(
    signals({
      globals: ['React', '__REACT_DEVTOOLS_GLOBAL_HOOK__', '__NEXT_DATA__', 'webpackChunk'],
      markers: ['next-root', 'tailwind'],
      urls: [
        'https://example.com/_next/static/chunks/main.js',
        'https://fonts.googleapis.com/css2?family=Inter',
      ],
      versions: { react: '18.3.1' },
    })
  );

  const ids = idsOf(detected);
  assert.ok(ids.includes('react'));
  assert.ok(ids.includes('next'));
  assert.ok(ids.includes('tailwind'));
  assert.ok(ids.includes('webpack'));
  assert.ok(ids.includes('google-fonts'));
  assert.equal(find(detected, 'react').version, '18.3.1');
});

test('a typical WordPress shop is identified end to end', () => {
  const detected = detectStack(
    signals({
      globals: ['jQuery', 'woocommerce_params'],
      markers: ['woocommerce'],
      urls: ['https://shop.test/wp-content/plugins/woocommerce/assets/js/frontend.js'],
      generator: 'WordPress 6.5',
      versions: { jquery: '3.7.1' },
    })
  );

  const ids = idsOf(detected);
  assert.ok(ids.includes('wordpress'));
  assert.ok(ids.includes('woocommerce'));
  assert.ok(ids.includes('jquery'));
  assert.equal(find(detected, 'jquery').version, '3.7.1');
  assert.equal(find(detected, 'woocommerce').confidence, 'high');
});

// --- Summary and grouping ----------------------------------------------------

test('summarize counts totals, categories and confident detections', () => {
  const detected = detectStack(
    signals({ globals: ['React', 'jQuery'], markers: ['data-reactroot'] })
  );
  const summary = summarize(detected);

  assert.equal(summary.total, 2);
  assert.equal(summary.byCategory.framework, 1);
  assert.equal(summary.byCategory.library, 1);
  assert.equal(summary.confident, 1);
});

test('summarize tolerates junk', () => {
  assert.equal(summarize(null).total, 0);
  assert.deepEqual(summarize([]).byCategory, {});
});

test('groupByCategory keeps the declared order and drops empty groups', () => {
  const groups = groupByCategory(detectStack(signals({ globals: ['jQuery', 'React'] })));
  assert.deepEqual(groups.map((group) => group.id), ['framework', 'library']);
});

test('groupByCategory tolerates junk', () => {
  assert.deepEqual(groupByCategory(null), []);
});

// --- Export ------------------------------------------------------------------

test('toRows emits a header and one row per technology', () => {
  const rows = toRows(detectStack(signals({ globals: ['React'], versions: { react: '18.2.0' } })));
  assert.deepEqual(rows[0], [...CSV_HEADER]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['React', 'framework', '18.2.0', 'low', 'window.React']);
});

test('every row has the same width as the header', () => {
  const rows = toRows(detectStack(signals({ globals: ['React', 'jQuery', 'Vue'] })));
  for (const row of rows) assert.equal(row.length, CSV_HEADER.length);
});

test('toRows rejects a non-array', () => {
  assert.throws(() => toRows(null), TypeError);
});
