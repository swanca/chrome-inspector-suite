/**
 * Alt-text rules.
 *
 * Pure functions: collected image records in, judgements out. No DOM, no
 * chrome.* APIs - which is what makes this file directly unit-testable.
 *
 * The distinction that matters throughout: a MISSING alt attribute is a
 * failure, because assistive technology falls back to reading the file name.
 * An EMPTY alt attribute (alt="") is correct and deliberate - it marks the
 * image as decorative and tells a screen reader to skip it.
 */

export const STATUS = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
});

/** Beyond this, an alt is usually a caption in disguise. */
export const ALT_MAX = 125;

/** Words that describe the medium rather than the content. */
const PLACEHOLDERS = new Set([
  'image', 'images', 'img', 'photo', 'photos', 'picture', 'pictures',
  'graphic', 'graphics', 'icon', 'banner', 'thumbnail', 'spacer', 'untitled',
]);

const REDUNDANT_PREFIX = /^(?:an?\s+)?(?:image|picture|photo|graphic|screenshot)\s+(?:of|showing)\b/i;

/** Normalises text for comparison: lowercase, alphanumerics only. */
function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Extracts the file name of a URL, without extension or cache-busting query.
 * @param {string} src
 * @returns {string}
 */
export function fileNameOf(src) {
  if (!src) return '';

  // Inline and object URLs have no file name; returning their payload would
  // make the "alt repeats the file name" rule fire on nonsense.
  if (/^(data|blob):/i.test(String(src).trim())) return '';

  let path = String(src);
  try {
    path = new URL(src).pathname;
  } catch {
    path = path.split('?')[0].split('#')[0];
  }

  const last = path.split('/').filter(Boolean).pop() || '';
  return last.replace(/\.[a-z0-9]{1,5}$/i, '');
}

/**
 * Judges one image.
 *
 * @param {object} image One entry of collectImages().images
 * @returns {{status: string, reason: string}}
 */
export function classifyImage(image) {
  if (!image) return { status: STATUS.ERROR, reason: 'No image record.' };

  const alt = image.alt;

  // Explicitly hidden from assistive technology: nothing to announce.
  if (image.ariaHidden || image.role === 'presentation' || image.role === 'none') {
    return { status: STATUS.INFO, reason: 'Hidden from assistive technology on purpose.' };
  }

  if (alt === null || alt === undefined) {
    if (image.ariaLabel) {
      return { status: STATUS.WARNING, reason: 'No alt attribute, but aria-label is present.' };
    }
    return {
      status: STATUS.ERROR,
      reason: 'No alt attribute. Screen readers will read the file name instead.',
    };
  }

  const text = String(alt).trim();

  if (!text) {
    if (image.inLink) {
      return {
        status: STATUS.ERROR,
        reason: 'Empty alt inside a link, which leaves the link with no name.',
      };
    }
    const tiny = image.naturalWidth > 0 && image.naturalWidth <= 2 && image.naturalHeight <= 2;
    return {
      status: STATUS.INFO,
      reason: tiny ? 'Tracking pixel, correctly marked decorative.' : 'Decorative (alt="").',
    };
  }

  if (text.length > ALT_MAX) {
    return {
      status: STATUS.WARNING,
      reason: text.length + ' characters. Over ' + ALT_MAX + ' usually belongs in a caption.',
    };
  }

  if (PLACEHOLDERS.has(text.toLowerCase())) {
    return { status: STATUS.WARNING, reason: '"' + text + '" describes the medium, not the content.' };
  }

  if (REDUNDANT_PREFIX.test(text)) {
    return {
      status: STATUS.WARNING,
      reason: 'Starts with a redundant prefix; screen readers already say "image".',
    };
  }

  const fileName = fileNameOf(image.src);
  if (fileName && normalise(text) === normalise(fileName)) {
    return { status: STATUS.WARNING, reason: 'Alt text is just the file name.' };
  }

  return { status: STATUS.OK, reason: text.length + ' characters.' };
}

/**
 * Annotates every collected image with its judgement.
 *
 * @param {object} data Output of collectImages().
 * @returns {Array<object>}
 * @throws {TypeError} If data is malformed.
 */
export function annotate(data) {
  if (!data || !Array.isArray(data.images)) {
    throw new TypeError('annotate() requires collected image data.');
  }
  return data.images.map((image) => ({ ...image, ...classifyImage(image) }));
}

/** Counts each status, plus an overall verdict. */
export function summarize(images) {
  const summary = { ok: 0, warning: 0, error: 0, info: 0, total: 0 };
  if (!Array.isArray(images)) return { ...summary, status: STATUS.OK };

  for (const image of images) {
    if (Object.prototype.hasOwnProperty.call(summary, image.status)) {
      summary[image.status]++;
      summary.total++;
    }
  }

  summary.status = summary.error ? STATUS.ERROR : summary.warning ? STATUS.WARNING : STATUS.OK;
  return summary;
}

export const FILTERS = Object.freeze([
  { id: 'all', label: 'All images' },
  { id: 'issues', label: 'Problems only' },
  { id: 'error', label: 'Missing alt' },
  { id: 'warning', label: 'Weak alt' },
  { id: 'ok', label: 'Good alt' },
  { id: 'info', label: 'Decorative' },
]);

/**
 * Applies the popup's filter.
 * @param {Array<object>} images
 * @param {string} filter One of FILTERS[].id
 * @returns {Array<object>}
 */
export function filterImages(images, filter) {
  if (!Array.isArray(images)) throw new TypeError('filterImages() requires an array.');

  if (!filter || filter === 'all') return images;
  if (filter === 'issues') {
    return images.filter((image) => image.status === STATUS.ERROR || image.status === STATUS.WARNING);
  }
  return images.filter((image) => image.status === filter);
}

export const CSV_HEADER = Object.freeze(['src', 'alt', 'status', 'reason', 'type', 'in_link']);

/**
 * Shapes annotated images into CSV rows, header included.
 * @param {Array<object>} images
 * @returns {Array<Array<string>>}
 */
export function toRows(images) {
  if (!Array.isArray(images)) throw new TypeError('toRows() requires an array.');

  return [
    [...CSV_HEADER],
    ...images.map((image) => [
      image.src || image.rawSrc || '',
      image.alt === null || image.alt === undefined ? '(missing)' : image.alt,
      image.status,
      image.reason,
      image.kind,
      image.inLink ? 'yes' : 'no',
    ]),
  ];
}
