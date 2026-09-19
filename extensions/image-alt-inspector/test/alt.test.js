import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyImage,
  fileNameOf,
  annotate,
  summarize,
  filterImages,
  toRows,
  CSV_HEADER,
  FILTERS,
  STATUS,
  ALT_MAX,
} from '../src/lib/alt.js';

/** A well-formed image; tests override only the field under test. */
const image = (overrides = {}) => ({
  index: 0,
  kind: 'img',
  alt: 'A red bicycle leaning on a wall',
  src: 'https://example.com/img/bike-01.jpg',
  rawSrc: '/img/bike-01.jpg',
  title: '',
  role: '',
  ariaHidden: false,
  ariaLabel: '',
  loading: '',
  width: 400,
  height: 300,
  naturalWidth: 800,
  naturalHeight: 600,
  inLink: false,
  ...overrides,
});

// --- fileNameOf --------------------------------------------------------------

test('fileNameOf strips the path, extension and query', () => {
  assert.equal(fileNameOf('https://example.com/img/bike-01.jpg'), 'bike-01');
  assert.equal(fileNameOf('https://example.com/a/b/photo.png?v=2'), 'photo');
  assert.equal(fileNameOf('/relative/name.webp'), 'name');
  assert.equal(fileNameOf('no-slashes.gif'), 'no-slashes');
});

test('fileNameOf tolerates odd input', () => {
  assert.equal(fileNameOf(''), '');
  assert.equal(fileNameOf(null), '');
  assert.equal(fileNameOf('https://example.com/'), '');
  // Data and blob URLs carry no file name at all.
  assert.equal(fileNameOf('data:image/png;base64,AAAA'), '');
  assert.equal(fileNameOf('blob:https://example.com/9f8e7d'), '');
});

// --- The distinction that matters --------------------------------------------

test('a missing alt attribute is an error', () => {
  const result = classifyImage(image({ alt: null }));
  assert.equal(result.status, STATUS.ERROR);
  assert.match(result.reason, /file name/i);
});

test('an empty alt attribute is correct, not an error', () => {
  // alt="" is how you mark an image decorative. Conflating it with a missing
  // alt is the classic false positive this tool must not produce.
  const result = classifyImage(image({ alt: '' }));
  assert.equal(result.status, STATUS.INFO);
  assert.match(result.reason, /decorative/i);
});

test('a good alt passes', () => {
  assert.equal(classifyImage(image()).status, STATUS.OK);
});

// --- Decorative and hidden ---------------------------------------------------

test('aria-hidden and presentation roles are reported as deliberate', () => {
  assert.equal(classifyImage(image({ alt: null, ariaHidden: true })).status, STATUS.INFO);
  assert.equal(classifyImage(image({ alt: null, role: 'presentation' })).status, STATUS.INFO);
  assert.equal(classifyImage(image({ alt: null, role: 'none' })).status, STATUS.INFO);
});

test('a tracking pixel with an empty alt is named as such', () => {
  const result = classifyImage(image({ alt: '', naturalWidth: 1, naturalHeight: 1 }));
  assert.equal(result.status, STATUS.INFO);
  assert.match(result.reason, /tracking pixel/i);
});

test('an empty alt inside a link is an error, because the link loses its name', () => {
  const result = classifyImage(image({ alt: '', inLink: true }));
  assert.equal(result.status, STATUS.ERROR);
  assert.match(result.reason, /link/i);
});

test('a missing alt with an aria-label is downgraded to a warning', () => {
  const result = classifyImage(image({ alt: null, ariaLabel: 'Home' }));
  assert.equal(result.status, STATUS.WARNING);
});

// --- Weak alt text -----------------------------------------------------------

test('an over-long alt is a warning', () => {
  const result = classifyImage(image({ alt: 'x'.repeat(ALT_MAX + 1) }));
  assert.equal(result.status, STATUS.WARNING);
  assert.match(result.reason, /caption/i);
});

test('an alt at exactly the limit still passes', () => {
  assert.equal(classifyImage(image({ alt: 'x'.repeat(ALT_MAX) })).status, STATUS.OK);
});

test('placeholder words are a warning', () => {
  for (const word of ['image', 'Photo', 'PICTURE', 'icon', 'untitled']) {
    assert.equal(classifyImage(image({ alt: word })).status, STATUS.WARNING, word);
  }
});

test('a placeholder word inside a real sentence is fine', () => {
  assert.equal(classifyImage(image({ alt: 'Image of the year award ceremony' })).status, STATUS.WARNING);
  assert.equal(classifyImage(image({ alt: 'The team icon designer at work' })).status, STATUS.OK);
});

test('redundant prefixes are a warning', () => {
  assert.equal(classifyImage(image({ alt: 'Photo of a bridge' })).status, STATUS.WARNING);
  assert.equal(classifyImage(image({ alt: 'An image showing the results' })).status, STATUS.WARNING);
  assert.equal(classifyImage(image({ alt: 'Screenshot of the settings panel' })).status, STATUS.WARNING);
});

test('alt that merely repeats the file name is a warning', () => {
  assert.equal(classifyImage(image({ alt: 'bike-01' })).status, STATUS.WARNING);
  assert.equal(classifyImage(image({ alt: 'Bike 01' })).status, STATUS.WARNING);
  assert.equal(classifyImage(image({ alt: 'bike_01' })).status, STATUS.WARNING);
});

test('alt that happens to contain the file name is still fine', () => {
  assert.equal(classifyImage(image({ alt: 'Our bike-01 prototype in the workshop' })).status, STATUS.OK);
});

test('classifyImage never throws on junk', () => {
  assert.equal(classifyImage(null).status, STATUS.ERROR);
  assert.equal(classifyImage({}).status, STATUS.ERROR);
  assert.ok(classifyImage({ alt: 'x' }).status);
});

// --- annotate and summarize --------------------------------------------------

const page = {
  url: 'https://example.com/',
  images: [
    image({ index: 0 }),
    image({ index: 1, alt: null }),
    image({ index: 2, alt: '' }),
    image({ index: 3, alt: 'image' }),
    image({ index: 4, alt: null, ariaHidden: true }),
  ],
};

test('annotate judges every image and keeps its data', () => {
  const images = annotate(page);
  assert.equal(images.length, 5);
  assert.deepEqual(
    images.map((i) => i.status),
    [STATUS.OK, STATUS.ERROR, STATUS.INFO, STATUS.WARNING, STATUS.INFO]
  );
  assert.equal(images[0].src, page.images[0].src);
});

test('annotate rejects malformed input', () => {
  assert.throws(() => annotate(null), TypeError);
  assert.throws(() => annotate({}), TypeError);
});

test('summarize counts statuses and gives an overall verdict', () => {
  const summary = summarize(annotate(page));
  assert.equal(summary.total, 5);
  assert.equal(summary.error, 1);
  assert.equal(summary.warning, 1);
  assert.equal(summary.ok, 1);
  assert.equal(summary.info, 2);
  assert.equal(summary.status, STATUS.ERROR);
});

test('summarize lets warnings win when there is no error', () => {
  assert.equal(summarize([{ status: 'warning' }, { status: 'ok' }]).status, STATUS.WARNING);
  assert.equal(summarize([{ status: 'ok' }]).status, STATUS.OK);
  assert.equal(summarize([]).status, STATUS.OK);
  assert.equal(summarize(null).status, STATUS.OK);
});

// --- Filtering ---------------------------------------------------------------

test('every declared filter works', () => {
  const images = annotate(page);
  for (const filter of FILTERS) {
    assert.ok(Array.isArray(filterImages(images, filter.id)), filter.id);
  }
});

test('filters narrow to the expected sets', () => {
  const images = annotate(page);
  assert.equal(filterImages(images, 'all').length, 5);
  assert.equal(filterImages(images, 'issues').length, 2);
  assert.equal(filterImages(images, 'error').length, 1);
  assert.equal(filterImages(images, 'warning').length, 1);
  assert.equal(filterImages(images, 'ok').length, 1);
  assert.equal(filterImages(images, 'info').length, 2);
});

test('filterImages rejects a non-array', () => {
  assert.throws(() => filterImages(null, 'all'), TypeError);
});

// --- Export ------------------------------------------------------------------

test('toRows emits a header and one row per image', () => {
  const rows = toRows(annotate(page));
  assert.deepEqual(rows[0], [...CSV_HEADER]);
  assert.equal(rows.length, 6);
});

test('a missing alt is exported as "(missing)", never as an empty cell', () => {
  // An empty cell would be indistinguishable from alt="", which is the one
  // distinction this whole extension exists to make.
  const rows = toRows(annotate(page));
  assert.equal(rows[2][1], '(missing)');
  assert.equal(rows[3][1], '');
});

test('every row has the same width as the header', () => {
  for (const row of toRows(annotate(page))) {
    assert.equal(row.length, CSV_HEADER.length);
  }
});

test('toRows rejects a non-array', () => {
  assert.throws(() => toRows(null), TypeError);
});
