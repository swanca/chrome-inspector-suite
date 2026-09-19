import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectTrackers,
  extractIds,
  summarize,
  groupByCategory,
  toRows,
  TRACKERS,
  CATEGORIES,
  CSV_HEADER,
} from '../src/lib/trackers.js';

const signals = (overrides = {}) => ({
  url: 'https://shop.example.com/',
  origin: 'https://shop.example.com',
  globals: [],
  scripts: [],
  iframes: [],
  cookieNames: [],
  gtmContainers: [],
  inline: '',
  ...overrides,
});

const idsOf = (detected) => detected.map((tracker) => tracker.id);

// --- Registry integrity ------------------------------------------------------

test('every tracker declares a known category and at least one signal', () => {
  const categories = new Set(CATEGORIES.map((category) => category.id));

  for (const tracker of TRACKERS) {
    assert.ok(tracker.id, 'tracker without an id');
    assert.ok(tracker.name, tracker.id + ' has no name');
    assert.ok(categories.has(tracker.category), tracker.id + ' has category ' + tracker.category);

    const signalCount =
      (tracker.globals || []).length + (tracker.hosts || []).length + (tracker.cookies || []).length;
    assert.ok(signalCount > 0, tracker.id + ' can never be detected');
  }
});

test('tracker ids are unique', () => {
  const ids = TRACKERS.map((tracker) => tracker.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- Detection ---------------------------------------------------------------

test('a clean page detects nothing', () => {
  assert.deepEqual(detectTrackers(signals()), []);
});

test('detectTrackers rejects junk', () => {
  assert.throws(() => detectTrackers(null), TypeError);
  assert.throws(() => detectTrackers('nope'), TypeError);
});

test('a global is enough to detect a tracker', () => {
  const detected = detectTrackers(signals({ globals: ['fbq'] }));
  assert.deepEqual(idsOf(detected), ['meta']);
  assert.deepEqual(detected[0].evidence, ['window.fbq']);
});

test('a loaded script is enough to detect a tracker', () => {
  const detected = detectTrackers(
    signals({ scripts: ['https://static.hotjar.com/c/hotjar-123.js'] })
  );
  assert.deepEqual(idsOf(detected), ['hotjar']);
});

test('a subdomain of a tracker host still matches', () => {
  const detected = detectTrackers(
    signals({ scripts: ['https://region1.google-analytics.com/g/collect'] })
  );
  assert.ok(idsOf(detected).includes('ga4'));
});

test('a lookalike domain does not match', () => {
  // "google-analytics.com.evil.test" ends with a different registrable domain.
  const detected = detectTrackers(
    signals({ scripts: ['https://google-analytics.com.evil.test/x.js'] })
  );
  assert.deepEqual(detected, []);
});

test('a hostname that merely contains a tracker domain does not match', () => {
  const detected = detectTrackers(signals({ scripts: ['https://notclarity.ms.test/a.js'] }));
  assert.deepEqual(detected, []);
});

test('an iframe counts as evidence, like a script', () => {
  const detected = detectTrackers(
    signals({ iframes: ['https://www.googletagmanager.com/ns.html?id=GTM-ABC'] })
  );
  assert.deepEqual(idsOf(detected), ['gtm']);
});

test('cookie names are matched by prefix, because they carry suffixes', () => {
  const detected = detectTrackers(signals({ cookieNames: ['_ga_9F8E7D6C5B', '_gid'] }));
  assert.ok(idsOf(detected).includes('ga4'));
  assert.ok(detected[0].evidence.some((item) => item.startsWith('cookie ')));
});

test('several signals for the same tracker are all listed as evidence', () => {
  const detected = detectTrackers(
    signals({
      globals: ['fbq', '_fbq'],
      scripts: ['https://connect.facebook.net/en_US/fbevents.js'],
      cookieNames: ['_fbp'],
    })
  );
  assert.equal(detected.length, 1);
  assert.equal(detected[0].evidence.length, 4);
});

test('several different trackers are all reported', () => {
  const detected = detectTrackers(
    signals({
      globals: ['google_tag_manager', 'fbq', 'hj'],
      scripts: ['https://cdn.cookielaw.org/otSDKStub.js'],
    })
  );
  assert.deepEqual(idsOf(detected).sort(), ['gtm', 'hotjar', 'meta', 'onetrust']);
});

// --- Identifier extraction ---------------------------------------------------

test('extractIds finds tag identifiers in script URLs', () => {
  const found = extractIds(
    signals({ scripts: ['https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4'] })
  );
  assert.deepEqual(found, [{ label: 'GA4 measurement', value: 'G-ABC123DEF4' }]);
});

test('extractIds finds identifiers in inline snippets', () => {
  const found = extractIds(
    signals({ inline: "w[l].push({'gtm.start':new Date()});})(window,'GTM-WXYZ12');" })
  );
  assert.deepEqual(found, [{ label: 'GTM container', value: 'GTM-WXYZ12' }]);
});

test('extractIds pulls the numeric id out of a Meta Pixel init call', () => {
  const found = extractIds(signals({ inline: "fbq('init', '123456789012345');" }));
  assert.deepEqual(found, [{ label: 'Meta Pixel', value: '123456789012345' }]);
});

test('extractIds handles double quotes and loose spacing', () => {
  const found = extractIds(signals({ inline: 'fbq( "init" ,  "987654321" )' }));
  assert.deepEqual(found, [{ label: 'Meta Pixel', value: '987654321' }]);
});

test('extractIds recognises Universal Analytics and Google Ads ids', () => {
  const found = extractIds(signals({ inline: "ga('create','UA-12345-6'); AW-1234567890" }));
  assert.deepEqual(found.map((item) => item.value), ['UA-12345-6', 'AW-1234567890']);
});

test('extractIds deduplicates repeated identifiers', () => {
  const found = extractIds(
    signals({
      scripts: ['https://www.googletagmanager.com/gtm.js?id=GTM-AAA111'],
      inline: "'GTM-AAA111' 'GTM-AAA111'",
    })
  );
  assert.equal(found.length, 1);
});

test('extractIds returns nothing for a clean page and tolerates junk', () => {
  assert.deepEqual(extractIds(signals()), []);
  assert.deepEqual(extractIds(null), []);
});

test('repeated calls give the same result, so no regex state leaks between runs', () => {
  const input = signals({ inline: 'GTM-AAA111 GTM-BBB222' });
  assert.deepEqual(extractIds(input), extractIds(input));
  assert.equal(extractIds(input).length, 2);
});

// --- Summary -----------------------------------------------------------------

test('advertising without a consent tool is flagged', () => {
  const summary = summarize(detectTrackers(signals({ globals: ['fbq'] })));
  assert.equal(summary.needsConsent, true);
  assert.equal(summary.hasConsent, false);
  assert.equal(summary.status, 'warning');
});

test('advertising alongside a consent tool is not flagged', () => {
  const summary = summarize(
    detectTrackers(signals({ globals: ['fbq'], scripts: ['https://cdn.cookielaw.org/x.js'] }))
  );
  assert.equal(summary.hasConsent, true);
  assert.equal(summary.status, 'info');
});

test('session replay also requires consent', () => {
  const summary = summarize(detectTrackers(signals({ globals: ['hj'] })));
  assert.equal(summary.needsConsent, true);
  assert.equal(summary.status, 'warning');
});

test('analytics alone does not raise the consent flag', () => {
  const summary = summarize(detectTrackers(signals({ globals: ['plausible'] })));
  assert.equal(summary.needsConsent, false);
  assert.equal(summary.status, 'info');
});

test('a page with nothing on it is ok', () => {
  const summary = summarize([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.status, 'ok');
  assert.equal(summarize(null).status, 'ok');
});

test('summarize counts per category', () => {
  const summary = summarize(detectTrackers(signals({ globals: ['fbq', 'ttq', 'hj'] })));
  assert.equal(summary.byCategory.advertising, 2);
  assert.equal(summary.byCategory.session, 1);
});

// --- Grouping and export -----------------------------------------------------

test('groupByCategory keeps the declared order and drops empty groups', () => {
  const groups = groupByCategory(detectTrackers(signals({ globals: ['fbq', 'Cookiebot'] })));
  assert.deepEqual(groups.map((group) => group.id), ['consent', 'advertising']);
  assert.equal(groups[0].trackers[0].name, 'Cookiebot');
});

test('groupByCategory tolerates junk', () => {
  assert.deepEqual(groupByCategory(null), []);
  assert.deepEqual(groupByCategory([]), []);
});

test('toRows emits a header and one row per tracker', () => {
  const rows = toRows(detectTrackers(signals({ globals: ['fbq'] })));
  assert.deepEqual(rows[0], [...CSV_HEADER]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'Meta Pixel');
  assert.equal(rows[1][1], 'advertising');
  assert.equal(rows[1][2], 'window.fbq');
});

test('toRows rejects a non-array', () => {
  assert.throws(() => toRows(null), TypeError);
});
