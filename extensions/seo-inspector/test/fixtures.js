/**
 * Test fixtures.
 *
 * `cleanPage()` is a page that should pass every rule. Individual tests
 * override only the field under test, so a failure points at one rule.
 */

export const CLEAN_TITLE = 'MetaLens - on-page SEO and accessibility';

export const CLEAN_DESCRIPTION =
  'MetaLens audits the current page for SEO, Open Graph and accessibility ' +
  'issues, entirely inside your browser.';

/** @returns {object} A deep copy, so tests can mutate freely. */
export function cleanPage(overrides = {}) {
  const base = {
    url: 'https://example.com/page',
    origin: 'https://example.com',
    protocol: 'https:',

    lang: 'en',
    charset: 'UTF-8',
    hasCharsetTag: true,
    viewport: 'width=device-width, initial-scale=1',

    title: CLEAN_TITLE,
    titleCount: 1,

    description: CLEAN_DESCRIPTION,
    descriptionCount: 1,

    canonical: 'https://example.com/page',
    canonicalRaw: 'https://example.com/page',
    canonicalCount: 1,

    robots: null,
    author: 'Example',
    themeColor: '#4f46e5',

    og: {
      title: CLEAN_TITLE,
      description: CLEAN_DESCRIPTION,
      image: 'https://example.com/card.png',
      url: 'https://example.com/page',
      type: 'website',
      siteName: 'Example',
      imageAlt: 'MetaLens card',
    },

    twitter: {
      card: 'summary_large_image',
      title: CLEAN_TITLE,
      description: CLEAN_DESCRIPTION,
      image: 'https://example.com/card.png',
      site: '@example',
    },

    headings: [
      { level: 1, text: 'Main heading' },
      { level: 2, text: 'Section one' },
      { level: 2, text: 'Section two' },
      { level: 3, text: 'Subsection' },
    ],
    h1Count: 1,

    images: { total: 2, missingAlt: 0, decorativeAlt: 0, missingAltSamples: [] },

    links: {
      total: 5,
      internal: 3,
      external: 2,
      nofollow: 0,
      emptyText: 0,
      emptyTextSamples: [],
    },

    hreflang: [],
    structuredData: ['WebPage'],
    wordCount: 500,
    collectedAt: '2026-09-19T10:00:00.000Z',
  };

  return { ...structuredClone(base), ...structuredClone(overrides) };
}

/** Pulls a single finding out of an audit by its stable id. */
export function findingById(audit, id) {
  const match = audit.findings.find((item) => item.id === id);
  if (!match) throw new Error('No finding with id "' + id + '"');
  return match;
}
