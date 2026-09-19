/**
 * Audit rules.
 *
 * Pure functions: raw page data in (the shape produced by
 * src/content/collect.js), judged findings out. No DOM, no chrome.* APIs,
 * no I/O - which is what makes this file directly unit-testable under Node.
 */

/** Thresholds, exported so tests and the UI cannot drift from each other. */
export const RULES = Object.freeze({
  TITLE_MIN: 30,
  TITLE_MAX: 60,
  DESC_MIN: 70,
  DESC_MAX: 160,
  OG_TITLE_MAX: 90,
  OG_DESC_MAX: 200,
});

export const STATUS = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
});

export const GROUPS = Object.freeze([
  { id: 'essentials', label: 'SEO essentials' },
  { id: 'social', label: 'Social sharing' },
  { id: 'structure', label: 'Structure & accessibility' },
]);

const ORDER = { error: 0, warning: 1, info: 2, ok: 3 };

/**
 * @param {string} id      Stable identifier, also used as the render key.
 * @param {string} group   One of GROUPS[].id
 * @param {string} label   Human label for the row.
 * @param {string} status  One of STATUS
 * @param {string} message Why this status was given.
 * @param {*}      [value] The observed value, shown verbatim to the user.
 */
function finding(id, group, label, status, message, value = null) {
  return { id, group, label, status, message, value };
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** True for a fully-qualified http(s) URL. */
export function isAbsoluteHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Finds the first place a heading outline skips a level (h2 -> h4).
 *
 * @param {Array<{level: number, text: string}>} headings
 * @returns {{from: number, to: number, index: number}|null}
 */
export function findHeadingSkip(headings) {
  if (!Array.isArray(headings)) return null;
  let previous = 0;
  for (let i = 0; i < headings.length; i++) {
    const level = Number(headings[i] && headings[i].level);
    if (!Number.isInteger(level) || level < 1 || level > 6) continue;
    if (previous && level > previous + 1) return { from: previous, to: level, index: i };
    previous = level;
  }
  return null;
}

function auditEssentials(data) {
  const out = [];

  // --- Title ---
  const title = text(data.title);
  if (Number(data.titleCount) > 1) {
    out.push(finding('title', 'essentials', 'Title', STATUS.ERROR,
      data.titleCount + ' <title> tags found. Keep exactly one.', title || null));
  } else if (!title) {
    out.push(finding('title', 'essentials', 'Title', STATUS.ERROR,
      'Missing. Every page needs a unique <title>.'));
  } else if (title.length < RULES.TITLE_MIN) {
    out.push(finding('title', 'essentials', 'Title', STATUS.WARNING,
      title.length + ' characters - short. Aim for ' + RULES.TITLE_MIN + '-' + RULES.TITLE_MAX + '.', title));
  } else if (title.length > RULES.TITLE_MAX) {
    out.push(finding('title', 'essentials', 'Title', STATUS.WARNING,
      title.length + ' characters - likely truncated in search results.', title));
  } else {
    out.push(finding('title', 'essentials', 'Title', STATUS.OK,
      title.length + ' characters.', title));
  }

  // --- Meta description ---
  const description = text(data.description);
  if (Number(data.descriptionCount) > 1) {
    out.push(finding('description', 'essentials', 'Meta description', STATUS.ERROR,
      data.descriptionCount + ' description tags found. Keep exactly one.', description || null));
  } else if (!description) {
    out.push(finding('description', 'essentials', 'Meta description', STATUS.ERROR,
      'Missing. Search engines will invent a snippet instead.'));
  } else if (description.length < RULES.DESC_MIN) {
    out.push(finding('description', 'essentials', 'Meta description', STATUS.WARNING,
      description.length + ' characters - short. Aim for ' + RULES.DESC_MIN + '-' + RULES.DESC_MAX + '.', description));
  } else if (description.length > RULES.DESC_MAX) {
    out.push(finding('description', 'essentials', 'Meta description', STATUS.WARNING,
      description.length + ' characters - likely truncated.', description));
  } else {
    out.push(finding('description', 'essentials', 'Meta description', STATUS.OK,
      description.length + ' characters.', description));
  }

  // --- Canonical ---
  if (Number(data.canonicalCount) > 1) {
    out.push(finding('canonical', 'essentials', 'Canonical URL', STATUS.ERROR,
      data.canonicalCount + ' canonical links found. Keep exactly one.', data.canonical));
  } else if (!text(data.canonicalRaw)) {
    out.push(finding('canonical', 'essentials', 'Canonical URL', STATUS.WARNING,
      'Missing. Duplicate URLs may compete against each other.'));
  } else if (!isAbsoluteHttpUrl(data.canonical)) {
    out.push(finding('canonical', 'essentials', 'Canonical URL', STATUS.ERROR,
      'Not a valid absolute http(s) URL.', data.canonicalRaw));
  } else {
    out.push(finding('canonical', 'essentials', 'Canonical URL', STATUS.OK,
      'Present and absolute.', data.canonical));
  }

  // --- Robots ---
  const robots = text(data.robots).toLowerCase();
  if (robots.includes('noindex')) {
    out.push(finding('robots', 'essentials', 'Robots', STATUS.WARNING,
      'This page asks search engines not to index it.', data.robots));
  } else if (robots.includes('nofollow')) {
    out.push(finding('robots', 'essentials', 'Robots', STATUS.WARNING,
      'Links on this page will not be followed.', data.robots));
  } else if (robots) {
    out.push(finding('robots', 'essentials', 'Robots', STATUS.OK, 'Indexable.', data.robots));
  } else {
    out.push(finding('robots', 'essentials', 'Robots', STATUS.INFO,
      'No robots meta tag - defaults to indexable.'));
  }

  // --- Language ---
  if (!text(data.lang)) {
    out.push(finding('lang', 'essentials', 'Language', STATUS.ERROR,
      'No lang attribute on <html>. Screen readers cannot pick a voice.'));
  } else {
    out.push(finding('lang', 'essentials', 'Language', STATUS.OK, 'Declared.', data.lang));
  }

  // --- Charset ---
  if (!data.hasCharsetTag) {
    out.push(finding('charset', 'essentials', 'Charset', STATUS.WARNING,
      'No charset declaration found in the markup.', data.charset));
  } else {
    out.push(finding('charset', 'essentials', 'Charset', STATUS.OK, 'Declared.', data.charset));
  }

  // --- Viewport ---
  if (!text(data.viewport)) {
    out.push(finding('viewport', 'essentials', 'Viewport', STATUS.WARNING,
      'Missing. The page will not scale correctly on mobile.'));
  } else {
    out.push(finding('viewport', 'essentials', 'Viewport', STATUS.OK, 'Declared.', data.viewport));
  }

  // --- HTTPS (only reported when it is a problem) ---
  if (data.protocol && data.protocol !== 'https:') {
    out.push(finding('https', 'essentials', 'HTTPS', STATUS.WARNING,
      'Served over ' + String(data.protocol).replace(':', '') + '.', data.protocol));
  }

  return out;
}

function auditSocial(data) {
  const og = data.og || {};
  const twitter = data.twitter || {};
  const out = [];

  const required = [
    ['og:title', og.title, RULES.OG_TITLE_MAX],
    ['og:description', og.description, RULES.OG_DESC_MAX],
  ];

  for (const [tag, value, max] of required) {
    const content = text(value);
    if (!content) {
      out.push(finding(tag, 'social', tag, STATUS.WARNING,
        'Missing. Shared links will fall back to page content.'));
    } else if (content.length > max) {
      out.push(finding(tag, 'social', tag, STATUS.WARNING,
        content.length + ' characters - over the ' + max + ' character guideline.', content));
    } else {
      out.push(finding(tag, 'social', tag, STATUS.OK, content.length + ' characters.', content));
    }
  }

  if (!text(og.image)) {
    out.push(finding('og:image', 'social', 'og:image', STATUS.WARNING,
      'Missing. Shared links will have no preview image.'));
  } else if (!isAbsoluteHttpUrl(og.image)) {
    out.push(finding('og:image', 'social', 'og:image', STATUS.ERROR,
      'Must be an absolute http(s) URL.', og.image));
  } else {
    out.push(finding('og:image', 'social', 'og:image', STATUS.OK,
      'Present and absolute.', og.image));
  }

  if (!text(og.type)) {
    out.push(finding('og:type', 'social', 'og:type', STATUS.INFO,
      'Not set - defaults to "website".'));
  } else {
    out.push(finding('og:type', 'social', 'og:type', STATUS.OK, 'Declared.', og.type));
  }

  if (!text(twitter.card)) {
    out.push(finding('twitter:card', 'social', 'twitter:card', STATUS.WARNING,
      'Missing. X/Twitter falls back to Open Graph, with less control.'));
  } else {
    out.push(finding('twitter:card', 'social', 'twitter:card', STATUS.OK,
      'Declared.', twitter.card));
  }

  return out;
}

function auditStructure(data) {
  const out = [];
  const images = data.images || {};
  const links = data.links || {};
  const headings = Array.isArray(data.headings) ? data.headings : [];

  // --- H1 ---
  const h1Count = Number(data.h1Count) || 0;
  if (h1Count === 0) {
    out.push(finding('h1', 'structure', 'H1 heading', STATUS.ERROR,
      'No H1 found. The page has no main heading.'));
  } else if (h1Count > 1) {
    out.push(finding('h1', 'structure', 'H1 heading', STATUS.WARNING,
      h1Count + ' H1 headings. One per page is clearer.',
      headings.filter((h) => h.level === 1).map((h) => h.text).join(' | ')));
  } else {
    const first = headings.find((h) => h.level === 1);
    out.push(finding('h1', 'structure', 'H1 heading', STATUS.OK, 'Exactly one.',
      first ? first.text : null));
  }

  // --- Outline ---
  const skip = findHeadingSkip(headings);
  if (skip) {
    out.push(finding('outline', 'structure', 'Heading outline', STATUS.WARNING,
      'Jumps from H' + skip.from + ' to H' + skip.to + '. Do not skip levels.',
      headings[skip.index] ? headings[skip.index].text : null));
  } else if (headings.length) {
    out.push(finding('outline', 'structure', 'Heading outline', STATUS.OK,
      headings.length + ' headings, no skipped levels.'));
  } else {
    out.push(finding('outline', 'structure', 'Heading outline', STATUS.WARNING,
      'No headings at all on this page.'));
  }

  // --- Image alt text ---
  const totalImages = Number(images.total) || 0;
  const missingAlt = Number(images.missingAlt) || 0;
  if (totalImages === 0) {
    out.push(finding('alt', 'structure', 'Image alt text', STATUS.INFO,
      'No images on this page.'));
  } else if (missingAlt > 0) {
    out.push(finding('alt', 'structure', 'Image alt text', STATUS.WARNING,
      missingAlt + ' of ' + totalImages + ' images have no alt attribute.',
      (images.missingAltSamples || []).join('\n')));
  } else {
    out.push(finding('alt', 'structure', 'Image alt text', STATUS.OK,
      'All ' + totalImages + ' images have an alt attribute.'));
  }

  // --- Link labels ---
  const emptyText = Number(links.emptyText) || 0;
  if (emptyText > 0) {
    out.push(finding('link-text', 'structure', 'Link labels', STATUS.WARNING,
      emptyText + ' links have no discernible text.',
      (links.emptyTextSamples || []).join('\n')));
  } else if (Number(links.total) > 0) {
    out.push(finding('link-text', 'structure', 'Link labels', STATUS.OK,
      'All links are labelled.'));
  }

  out.push(finding('links', 'structure', 'Links', STATUS.INFO,
    (Number(links.internal) || 0) + ' internal, ' +
    (Number(links.external) || 0) + ' external, ' +
    (Number(links.nofollow) || 0) + ' nofollow.'));

  // --- Structured data ---
  const structuredData = Array.isArray(data.structuredData) ? data.structuredData : [];
  if (structuredData.includes('Invalid JSON-LD')) {
    out.push(finding('jsonld', 'structure', 'Structured data', STATUS.ERROR,
      'A JSON-LD block failed to parse.', structuredData.join(', ')));
  } else if (structuredData.length) {
    out.push(finding('jsonld', 'structure', 'Structured data', STATUS.OK,
      structuredData.length + ' JSON-LD block(s).', structuredData.join(', ')));
  } else {
    out.push(finding('jsonld', 'structure', 'Structured data', STATUS.INFO,
      'No JSON-LD found.'));
  }

  // --- hreflang (only when present) ---
  const hreflang = Array.isArray(data.hreflang) ? data.hreflang : [];
  if (hreflang.length) {
    out.push(finding('hreflang', 'structure', 'hreflang', STATUS.INFO,
      hreflang.length + ' alternate language link(s).',
      hreflang.map((h) => h.lang).join(', ')));
  }

  out.push(finding('words', 'structure', 'Word count', STATUS.INFO,
    (Number(data.wordCount) || 0) + ' words.'));

  return out;
}

/**
 * Rolls findings up into counts plus a single overall status.
 * Errors dominate warnings; warnings dominate everything else.
 *
 * @param {Array} findings
 * @returns {{ok: number, warning: number, error: number, info: number, total: number, status: string}}
 */
export function summarize(findings) {
  const summary = { ok: 0, warning: 0, error: 0, info: 0, total: 0 };
  if (!Array.isArray(findings)) return Object.assign(summary, { status: STATUS.OK });

  for (const item of findings) {
    const status = item && item.status;
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status]++;
      summary.total++;
    }
  }

  summary.status = summary.error ? STATUS.ERROR : summary.warning ? STATUS.WARNING : STATUS.OK;
  return summary;
}

/**
 * Runs every rule against collected page data.
 *
 * @param {object} data Output of collectPageData().
 * @returns {{findings: Array, summary: object, groups: Array}}
 * @throws {TypeError} If data is not an object.
 */
export function auditPage(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('auditPage() requires the page data object.');
  }

  const findings = [
    ...auditEssentials(data),
    ...auditSocial(data),
    ...auditStructure(data),
  ];

  return { findings, summary: summarize(findings), groups: GROUPS };
}

/** Sorts findings worst-first, keeping the original order within a status. */
export function bySeverity(findings) {
  const rank = (status) => (status in ORDER ? ORDER[status] : 9);
  return [...findings].sort((a, b) => rank(a.status) - rank(b.status));
}
