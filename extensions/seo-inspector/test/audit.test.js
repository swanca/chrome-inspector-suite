import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  auditPage,
  summarize,
  isAbsoluteHttpUrl,
  findHeadingSkip,
  bySeverity,
  RULES,
  STATUS,
} from '../src/lib/audit.js';

import { cleanPage, findingById, CLEAN_TITLE } from './fixtures.js';

// --- Contract ----------------------------------------------------------------

test('auditPage rejects non-object input', () => {
  assert.throws(() => auditPage(null), TypeError);
  assert.throws(() => auditPage('nope'), TypeError);
  assert.throws(() => auditPage(undefined), TypeError);
});

test('every finding carries the fields the UI renders', () => {
  const audit = auditPage(cleanPage());
  assert.ok(audit.findings.length > 10, 'expected a substantial set of checks');

  for (const item of audit.findings) {
    assert.equal(typeof item.id, 'string', 'id must be a string');
    assert.ok(item.id.length > 0);
    assert.ok(['essentials', 'social', 'structure'].includes(item.group));
    assert.equal(typeof item.label, 'string');
    assert.ok(Object.values(STATUS).includes(item.status));
    assert.equal(typeof item.message, 'string');
    assert.ok(item.message.length > 0, 'every finding must explain itself');
  }
});

test('finding ids are unique, so they are safe as render keys', () => {
  const ids = auditPage(cleanPage()).findings.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- The happy path ----------------------------------------------------------

test('a well-formed page produces no errors and no warnings', () => {
  const audit = auditPage(cleanPage());
  assert.equal(audit.summary.error, 0);
  assert.equal(audit.summary.warning, 0);
  assert.equal(audit.summary.status, STATUS.OK);
});

// --- Title -------------------------------------------------------------------

test('missing title is an error', () => {
  const audit = auditPage(cleanPage({ title: null, titleCount: 0 }));
  assert.equal(findingById(audit, 'title').status, STATUS.ERROR);
});

test('a whitespace-only title counts as missing', () => {
  const audit = auditPage(cleanPage({ title: '   ', titleCount: 1 }));
  assert.equal(findingById(audit, 'title').status, STATUS.ERROR);
});

test('duplicate title tags are an error', () => {
  const audit = auditPage(cleanPage({ titleCount: 2 }));
  const item = findingById(audit, 'title');
  assert.equal(item.status, STATUS.ERROR);
  assert.match(item.message, /2 <title>/);
});

test('a short title is a warning, not an error', () => {
  const audit = auditPage(cleanPage({ title: 'Home' }));
  assert.equal(findingById(audit, 'title').status, STATUS.WARNING);
});

test('a long title is a warning', () => {
  const audit = auditPage(cleanPage({ title: 'x'.repeat(RULES.TITLE_MAX + 1) }));
  assert.equal(findingById(audit, 'title').status, STATUS.WARNING);
});

test('title length boundaries are inclusive', () => {
  const atMin = auditPage(cleanPage({ title: 'x'.repeat(RULES.TITLE_MIN) }));
  const atMax = auditPage(cleanPage({ title: 'x'.repeat(RULES.TITLE_MAX) }));
  assert.equal(findingById(atMin, 'title').status, STATUS.OK);
  assert.equal(findingById(atMax, 'title').status, STATUS.OK);
});

// --- Meta description --------------------------------------------------------

test('missing meta description is an error', () => {
  const audit = auditPage(cleanPage({ description: null, descriptionCount: 0 }));
  assert.equal(findingById(audit, 'description').status, STATUS.ERROR);
});

test('an over-long meta description is a warning', () => {
  const audit = auditPage(cleanPage({ description: 'x'.repeat(RULES.DESC_MAX + 1) }));
  assert.equal(findingById(audit, 'description').status, STATUS.WARNING);
});

test('duplicate meta descriptions are an error', () => {
  const audit = auditPage(cleanPage({ descriptionCount: 3 }));
  assert.equal(findingById(audit, 'description').status, STATUS.ERROR);
});

// --- Canonical ---------------------------------------------------------------

test('missing canonical is a warning', () => {
  const audit = auditPage(cleanPage({ canonical: null, canonicalRaw: null, canonicalCount: 0 }));
  assert.equal(findingById(audit, 'canonical').status, STATUS.WARNING);
});

test('a canonical that will not resolve is an error', () => {
  const audit = auditPage(cleanPage({ canonical: null, canonicalRaw: '/page', canonicalCount: 1 }));
  assert.equal(findingById(audit, 'canonical').status, STATUS.ERROR);
});

test('duplicate canonicals are an error', () => {
  const audit = auditPage(cleanPage({ canonicalCount: 2 }));
  assert.equal(findingById(audit, 'canonical').status, STATUS.ERROR);
});

// --- Robots, language, transport --------------------------------------------

test('noindex is surfaced as a warning', () => {
  const audit = auditPage(cleanPage({ robots: 'NOINDEX, follow' }));
  const item = findingById(audit, 'robots');
  assert.equal(item.status, STATUS.WARNING);
  assert.match(item.message, /not to index/i);
});

test('no robots tag is informational, not a problem', () => {
  assert.equal(findingById(auditPage(cleanPage()), 'robots').status, STATUS.INFO);
});

test('a missing lang attribute is an error', () => {
  const audit = auditPage(cleanPage({ lang: null }));
  assert.equal(findingById(audit, 'lang').status, STATUS.ERROR);
});

test('plain http is flagged, https is not mentioned at all', () => {
  const insecure = auditPage(cleanPage({ protocol: 'http:' }));
  assert.equal(findingById(insecure, 'https').status, STATUS.WARNING);

  const secure = auditPage(cleanPage());
  assert.equal(secure.findings.some((item) => item.id === 'https'), false);
});

test('a missing viewport is a warning', () => {
  const audit = auditPage(cleanPage({ viewport: null }));
  assert.equal(findingById(audit, 'viewport').status, STATUS.WARNING);
});

// --- Social ------------------------------------------------------------------

test('a missing og:image is a warning, a relative one is an error', () => {
  const missing = auditPage(cleanPage({ og: { ...cleanPage().og, image: null } }));
  assert.equal(findingById(missing, 'og:image').status, STATUS.WARNING);

  const relative = auditPage(cleanPage({ og: { ...cleanPage().og, image: '/card.png' } }));
  assert.equal(findingById(relative, 'og:image').status, STATUS.ERROR);
});

test('an over-long og:title is a warning', () => {
  const og = { ...cleanPage().og, title: 'x'.repeat(RULES.OG_TITLE_MAX + 1) };
  assert.equal(findingById(auditPage(cleanPage({ og })), 'og:title').status, STATUS.WARNING);
});

test('a missing twitter:card is a warning', () => {
  const twitter = { ...cleanPage().twitter, card: null };
  assert.equal(findingById(auditPage(cleanPage({ twitter })), 'twitter:card').status, STATUS.WARNING);
});

// --- Structure ---------------------------------------------------------------

test('no H1 is an error and several H1s are a warning', () => {
  const none = auditPage(cleanPage({ h1Count: 0, headings: [] }));
  assert.equal(findingById(none, 'h1').status, STATUS.ERROR);

  const many = auditPage(cleanPage({
    h1Count: 2,
    headings: [
      { level: 1, text: 'First' },
      { level: 1, text: 'Second' },
    ],
  }));
  assert.equal(findingById(many, 'h1').status, STATUS.WARNING);
});

test('the single H1 is reported back as the finding value', () => {
  assert.equal(findingById(auditPage(cleanPage()), 'h1').value, 'Main heading');
});

test('findHeadingSkip catches a skipped level and ignores valid outlines', () => {
  assert.equal(findHeadingSkip([{ level: 1 }, { level: 2 }, { level: 3 }]), null);
  assert.equal(findHeadingSkip([{ level: 1 }, { level: 2 }, { level: 2 }]), null);
  assert.equal(findHeadingSkip([]), null);
  assert.equal(findHeadingSkip('not an array'), null);

  assert.deepEqual(findHeadingSkip([{ level: 1 }, { level: 3 }]), { from: 1, to: 3, index: 1 });
});

test('going back up the outline is not a skip', () => {
  assert.equal(findHeadingSkip([{ level: 1 }, { level: 2 }, { level: 3 }, { level: 1 }]), null);
});

test('a skipped heading level is a warning', () => {
  const audit = auditPage(cleanPage({
    headings: [
      { level: 1, text: 'Main' },
      { level: 3, text: 'Too deep' },
    ],
  }));
  const item = findingById(audit, 'outline');
  assert.equal(item.status, STATUS.WARNING);
  assert.match(item.message, /H1 to H3/);
});

test('images without alt are a warning that counts them', () => {
  const audit = auditPage(cleanPage({
    images: { total: 10, missingAlt: 3, decorativeAlt: 1, missingAltSamples: ['/a.png'] },
  }));
  const item = findingById(audit, 'alt');
  assert.equal(item.status, STATUS.WARNING);
  assert.match(item.message, /3 of 10/);
});

test('decorative empty alt text is not counted as missing', () => {
  const audit = auditPage(cleanPage({
    images: { total: 4, missingAlt: 0, decorativeAlt: 4, missingAltSamples: [] },
  }));
  assert.equal(findingById(audit, 'alt').status, STATUS.OK);
});

test('unlabelled links are a warning', () => {
  const audit = auditPage(cleanPage({
    links: { total: 5, internal: 5, external: 0, nofollow: 0, emptyText: 2, emptyTextSamples: [] },
  }));
  assert.equal(findingById(audit, 'link-text').status, STATUS.WARNING);
});

test('broken JSON-LD is an error', () => {
  const audit = auditPage(cleanPage({ structuredData: ['Invalid JSON-LD'] }));
  assert.equal(findingById(audit, 'jsonld').status, STATUS.ERROR);
});

test('hreflang is only reported when the page has some', () => {
  assert.equal(auditPage(cleanPage()).findings.some((i) => i.id === 'hreflang'), false);

  const audit = auditPage(cleanPage({ hreflang: [{ lang: 'fr', href: 'https://example.com/fr' }] }));
  assert.equal(findingById(audit, 'hreflang').status, STATUS.INFO);
});

// --- Robustness --------------------------------------------------------------

test('a nearly empty page is audited without throwing', () => {
  const audit = auditPage({});
  assert.ok(audit.findings.length > 0);
  assert.equal(audit.summary.status, STATUS.ERROR);
});

// --- summarize ---------------------------------------------------------------

test('summarize counts each status and ignores unknown ones', () => {
  const summary = summarize([
    { status: 'ok' },
    { status: 'ok' },
    { status: 'warning' },
    { status: 'info' },
    { status: 'nonsense' },
  ]);

  assert.equal(summary.ok, 2);
  assert.equal(summary.warning, 1);
  assert.equal(summary.info, 1);
  assert.equal(summary.error, 0);
  assert.equal(summary.total, 4);
});

test('summarize lets errors dominate warnings', () => {
  assert.equal(summarize([{ status: 'ok' }]).status, STATUS.OK);
  assert.equal(summarize([{ status: 'warning' }, { status: 'ok' }]).status, STATUS.WARNING);
  assert.equal(summarize([{ status: 'warning' }, { status: 'error' }]).status, STATUS.ERROR);
  assert.equal(summarize([]).status, STATUS.OK);
  assert.equal(summarize(null).status, STATUS.OK);
});

// --- Helpers -----------------------------------------------------------------

test('isAbsoluteHttpUrl accepts only http and https', () => {
  assert.equal(isAbsoluteHttpUrl('https://example.com'), true);
  assert.equal(isAbsoluteHttpUrl('http://example.com/a?b=c'), true);

  assert.equal(isAbsoluteHttpUrl('/relative'), false);
  assert.equal(isAbsoluteHttpUrl('ftp://example.com'), false);
  assert.equal(isAbsoluteHttpUrl('javascript:alert(1)'), false);
  assert.equal(isAbsoluteHttpUrl(''), false);
  assert.equal(isAbsoluteHttpUrl(null), false);
  assert.equal(isAbsoluteHttpUrl(undefined), false);
});

test('bySeverity sorts worst first without mutating the input', () => {
  const input = [
    { id: 'a', status: 'ok' },
    { id: 'b', status: 'error' },
    { id: 'c', status: 'info' },
    { id: 'd', status: 'warning' },
  ];
  const sorted = bySeverity(input);

  assert.deepEqual(sorted.map((i) => i.id), ['b', 'd', 'c', 'a']);
  assert.deepEqual(input.map((i) => i.id), ['a', 'b', 'c', 'd']);
});

test('the clean fixture really does sit inside the documented bounds', () => {
  assert.ok(CLEAN_TITLE.length >= RULES.TITLE_MIN && CLEAN_TITLE.length <= RULES.TITLE_MAX);
});
