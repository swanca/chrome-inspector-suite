/**
 * Link classification, filtering and export shaping.
 *
 * Pure functions: collected link records in, decisions out. No DOM, no chrome.*
 * APIs - which is what makes this file directly unit-testable under Node.
 */

export const SCOPES = Object.freeze([
  { id: 'all', label: 'All links' },
  { id: 'internal', label: 'Internal' },
  { id: 'external', label: 'External' },
  { id: 'anchor', label: 'Anchors' },
  { id: 'nofollow', label: 'Nofollow' },
  { id: 'untitled', label: 'No link text' },
]);

/**
 * Categorises one link relative to the page it was found on.
 *
 * Origin comparison is done by parsing, never by prefix matching:
 * "https://example.com.evil.test" starts with "https://example.com" but is a
 * different site.
 *
 * @param {{raw: string, href: string|null}} link
 * @param {string} origin The page's own origin.
 * @returns {'internal'|'external'|'anchor'|'mailto'|'tel'|'script'|'other'}
 */
export function classifyLink(link, origin) {
  const raw = String(link && link.raw ? link.raw : '').trim();

  if (raw.startsWith('#')) return 'anchor';
  if (/^mailto:/i.test(raw)) return 'mailto';
  if (/^tel:/i.test(raw)) return 'tel';
  if (/^javascript:/i.test(raw)) return 'script';

  if (!link || !link.href) return 'other';

  let parsed;
  let base;
  try {
    parsed = new URL(link.href);
  } catch {
    return 'other';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'other';

  try {
    base = new URL(origin);
  } catch {
    return 'external';
  }

  return parsed.origin === base.origin ? 'internal' : 'external';
}

/** True when the link carries rel="nofollow". */
export function isNofollow(link) {
  return String(link && link.rel ? link.rel : '')
    .toLowerCase()
    .split(/\s+/)
    .includes('nofollow');
}

/**
 * The text a user or a screen reader would actually perceive for this link.
 * @returns {string} Possibly empty.
 */
export function linkLabel(link) {
  if (!link) return '';
  return (link.text || link.ariaLabel || link.imageAlt || link.title || '').trim();
}

/**
 * Annotates every collected link with its category, label and nofollow flag.
 *
 * @param {object} data Output of collectLinks().
 * @returns {Array<object>}
 */
export function annotate(data) {
  if (!data || !Array.isArray(data.links)) {
    throw new TypeError('annotate() requires collected link data.');
  }

  return data.links.map((link) => ({
    ...link,
    kind: classifyLink(link, data.origin),
    label: linkLabel(link),
    nofollow: isNofollow(link),
  }));
}

/**
 * Applies the popup's scope, search and de-duplication controls.
 *
 * @param {Array<object>} links Annotated links.
 * @param {object} [options]
 * @param {string} [options.scope]  One of SCOPES[].id
 * @param {string} [options.query]  Case-insensitive substring of href or label.
 * @param {boolean} [options.dedupe] Keep only the first link per href.
 * @returns {Array<object>}
 */
export function filterLinks(links, options = {}) {
  if (!Array.isArray(links)) throw new TypeError('filterLinks() requires an array.');

  const scope = options.scope || 'all';
  const query = String(options.query || '').trim().toLowerCase();

  let result = links;

  if (scope === 'nofollow') result = result.filter((link) => link.nofollow);
  else if (scope === 'untitled') result = result.filter((link) => !link.label);
  else if (scope !== 'all') result = result.filter((link) => link.kind === scope);

  if (query) {
    result = result.filter(
      (link) =>
        String(link.href || link.raw || '').toLowerCase().includes(query) ||
        link.label.toLowerCase().includes(query)
    );
  }

  if (options.dedupe) {
    const seen = new Set();
    result = result.filter((link) => {
      const key = link.href || link.raw;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return result;
}

/** Counts links per category, for the header pills. */
export function summarize(links) {
  const summary = {
    total: 0,
    internal: 0,
    external: 0,
    anchor: 0,
    mailto: 0,
    tel: 0,
    script: 0,
    other: 0,
    nofollow: 0,
    untitled: 0,
  };
  if (!Array.isArray(links)) return summary;

  for (const link of links) {
    summary.total++;
    if (Object.prototype.hasOwnProperty.call(summary, link.kind)) summary[link.kind]++;
    if (link.nofollow) summary.nofollow++;
    if (!link.label) summary.untitled++;
  }

  return summary;
}

export const CSV_HEADER = Object.freeze([
  'url',
  'text',
  'type',
  'rel',
  'target',
  'nofollow',
]);

/**
 * Shapes annotated links into CSV rows, header included.
 * @param {Array<object>} links
 * @returns {Array<Array<string>>}
 */
export function toRows(links) {
  if (!Array.isArray(links)) throw new TypeError('toRows() requires an array.');

  return [
    [...CSV_HEADER],
    ...links.map((link) => [
      link.href || link.raw || '',
      link.label,
      link.kind,
      link.rel || '',
      link.target || '',
      link.nofollow ? 'yes' : 'no',
    ]),
  ];
}

/** One URL per line, for the Copy button. */
export function toPlainList(links) {
  if (!Array.isArray(links)) throw new TypeError('toPlainList() requires an array.');
  return links.map((link) => link.href || link.raw || '').join('\n');
}
