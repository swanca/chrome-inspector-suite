import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auditPage } from '../src/lib/audit.js';
import { toMarkdown, toJson } from '../src/lib/format.js';
import { cleanPage, CLEAN_TITLE } from './fixtures.js';

// --- Markdown ----------------------------------------------------------------

test('toMarkdown reports the page identity and the verdict', () => {
  const data = cleanPage();
  const report = toMarkdown(data, auditPage(data));

  assert.match(report, /^# SEO Inspector report/);
  assert.ok(report.includes('https://example.com/page'));
  assert.ok(report.includes(CLEAN_TITLE));
  assert.match(report, /0 error\(s\), 0 warning\(s\)/);
});

test('toMarkdown renders one section per non-empty group', () => {
  const data = cleanPage();
  const report = toMarkdown(data, auditPage(data));

  assert.ok(report.includes('## SEO essentials'));
  assert.ok(report.includes('## Social sharing'));
  assert.ok(report.includes('## Structure & accessibility'));
});

test('toMarkdown marks failures so they are scannable', () => {
  const data = cleanPage({ title: null, titleCount: 0 });
  const report = toMarkdown(data, auditPage(data));

  assert.ok(report.includes('**[FAIL] Title**'));
  assert.ok(report.includes('[OK]'));
});

test('toMarkdown keeps multi-line values on a single line', () => {
  const data = cleanPage({
    images: { total: 3, missingAlt: 2, decorativeAlt: 0, missingAltSamples: ['/a.png', '/b.png'] },
  });
  const report = toMarkdown(data, auditPage(data));

  assert.ok(report.includes('`/a.png / /b.png`'));
  for (const line of report.split('\n')) {
    assert.equal(line.includes('\n'), false);
  }
});

test('toMarkdown states that nothing was sent anywhere', () => {
  const data = cleanPage();
  assert.match(toMarkdown(data, auditPage(data)), /No data left the browser\./);
});

test('toMarkdown survives a page with almost nothing on it', () => {
  const data = {};
  const report = toMarkdown(data, auditPage(data));
  assert.ok(report.includes('(none)'));
  assert.ok(report.includes('unknown'));
});

test('toMarkdown rejects missing arguments', () => {
  assert.throws(() => toMarkdown(null, {}), TypeError);
  assert.throws(() => toMarkdown({}, null), TypeError);
});

// --- JSON --------------------------------------------------------------------

test('toJson produces parseable JSON carrying summary, findings and raw page', () => {
  const data = cleanPage();
  const audit = auditPage(data);
  const parsed = JSON.parse(toJson(data, audit));

  assert.equal(parsed.tool, 'SEO Inspector');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.url, 'https://example.com/page');
  assert.equal(parsed.auditedAt, '2026-09-19T10:00:00.000Z');
  assert.deepEqual(parsed.summary, audit.summary);
  assert.equal(parsed.findings.length, audit.findings.length);
  assert.equal(parsed.page.title, CLEAN_TITLE);
});

test('toJson is pretty-printed so a diff of two exports is readable', () => {
  const data = cleanPage();
  assert.ok(toJson(data, auditPage(data)).includes('\n  '));
});

test('toJson rejects missing arguments', () => {
  assert.throws(() => toJson(null, {}), TypeError);
  assert.throws(() => toJson({}, null), TypeError);
});
