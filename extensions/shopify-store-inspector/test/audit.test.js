import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  auditStore,
  discountPercent,
  detectPlatformFeatures,
  describeStore,
  THRESHOLDS,
  STATUS,
} from '../src/lib/shopify.js';

/** A healthy product page; tests override only the field under test. */
const store = (overrides = {}) => ({
  url: 'https://shop.example.com/products/bike',
  hasShopifyGlobal: true,
  shop: 'shop.example.com',
  currency: 'EUR',
  designMode: false,
  hasLocalizationForm: false,
  theme: { id: '1', name: 'Dawn', role: 'main', themeStoreId: '887', sections: ['main-product'] },
  page: { type: 'product', resourceType: 'product', resourceId: '999' },
  product: {
    knows: { images: true, description: true, stock: true },
    id: '999',
    handle: 'bike',
    title: 'Acme City Bike',
    description: 'x'.repeat(THRESHOLDS.DESCRIPTION_MIN + 50),
    vendor: 'Acme',
    type: 'Bicycle',
    tags: ['city'],
    priceFrom: 19900,
    compareAtPrice: null,
    variantCount: 2,
    availableVariantCount: 2,
    imageCount: 5,
    images: [],
    options: [{ name: 'Size', values: ['S', 'M'] }],
    variants: [
      { id: '1', title: 'S', sku: 'A-S', price: 19900, available: true },
      { id: '2', title: 'M', sku: 'A-M', price: 24900, available: true },
    ],
    source: 'product-json',
  },
  seo: {
    description: 'x'.repeat(THRESHOLDS.SEO_DESCRIPTION_MIN + 20),
    canonical: 'https://shop.example.com/products/bike',
    robots: '',
    ogImage: 'https://shop.example.com/i.jpg',
  },
  urls: ['https://cdn.shopify.com/s/files/1/theme.js'],
  collectedAt: '2026-09-19T10:00:00.000Z',
  ...overrides,
});

const has = (audit, id) => audit.findings.some((finding) => finding.id === id);
const get = (audit, id) => audit.findings.find((finding) => finding.id === id);

// --- discountPercent ---------------------------------------------------------

test('discountPercent works on integer cents', () => {
  assert.equal(discountPercent(7500, 10000), 25);
  assert.equal(discountPercent(19900, 24900), 20);
});

test('discountPercent returns null when there is no genuine discount', () => {
  assert.equal(discountPercent(10000, 10000), null);
  assert.equal(discountPercent(10000, 5000), null);
  assert.equal(discountPercent(10000, 0), null);
  assert.equal(discountPercent(10000, null), null);
  assert.equal(discountPercent(null, 10000), null);
  assert.equal(discountPercent('7500', 10000), null);
  assert.equal(discountPercent(NaN, 10000), null);
});

// --- Platform features -------------------------------------------------------

test('a country or currency selector is reported as Shopify Markets', () => {
  const features = detectPlatformFeatures(store({ hasLocalizationForm: true }));
  assert.ok(features.some((feature) => feature.id === 'markets'));
});

test('theme app extensions are detected from their CDN path', () => {
  const features = detectPlatformFeatures(
    store({ urls: ['https://cdn.shopify.com/extensions/abc/123/assets/app.js'] })
  );
  assert.ok(features.some((feature) => feature.id === 'theme-app-extensions'));
});

test('Online Store 2.0 sections are reported when the page has them', () => {
  const features = detectPlatformFeatures(store());
  const os2 = features.find((feature) => feature.id === 'os2');
  assert.ok(os2);
  assert.match(os2.note, /1 section types?/);
});

test('a storefront with none of those reports nothing', () => {
  const features = detectPlatformFeatures(
    store({ hasLocalizationForm: false, theme: { sections: [] }, urls: [] })
  );
  assert.deepEqual(features, []);
});

test('detectPlatformFeatures rejects junk', () => {
  assert.throws(() => detectPlatformFeatures(null), TypeError);
});

// --- auditStore: the healthy baseline ----------------------------------------

test('a healthy product page produces no errors and no warnings', () => {
  const audit = auditStore(store());
  assert.equal(audit.summary.errors, 0);
  assert.equal(audit.summary.warnings, 0);
  assert.equal(audit.summary.status, STATUS.OK);
});

test('auditStore rejects junk', () => {
  assert.throws(() => auditStore(null), TypeError);
  assert.throws(() => auditStore('nope'), TypeError);
});

test('findings are sorted worst first', () => {
  const audit = auditStore(
    store({
      seo: { ...store().seo, robots: 'noindex' },
      product: { ...store().product, vendor: '', imageCount: 1 },
    })
  );
  const statuses = audit.findings.map((finding) => finding.status);
  assert.equal(statuses[0], STATUS.ERROR);
  assert.ok(statuses.indexOf(STATUS.WARNING) < statuses.indexOf(STATUS.INFO));
});

// --- Theme -------------------------------------------------------------------

test('theme editor preview is flagged', () => {
  assert.ok(has(auditStore(store({ designMode: true })), 'design-mode'));
});

test('a theme that is not live is flagged', () => {
  const audit = auditStore(store({ theme: { ...store().theme, role: 'unpublished' } }));
  assert.equal(get(audit, 'theme-role').status, STATUS.WARNING);
});

// --- SEO ---------------------------------------------------------------------

test('noindex is an error, not a warning', () => {
  const audit = auditStore(store({ seo: { ...store().seo, robots: 'noindex, follow' } }));
  assert.equal(get(audit, 'noindex').status, STATUS.ERROR);
});

test('a missing canonical is flagged, because Shopify duplicates product URLs', () => {
  const audit = auditStore(store({ seo: { ...store().seo, canonical: '' } }));
  assert.equal(get(audit, 'canonical').status, STATUS.WARNING);
});

test('a missing or short meta description is flagged', () => {
  assert.ok(has(auditStore(store({ seo: { ...store().seo, description: '' } })), 'meta-description'));
  assert.ok(
    has(auditStore(store({ seo: { ...store().seo, description: 'Short.' } })), 'meta-description-short')
  );
});

// --- Product images ----------------------------------------------------------

test('no product images is an error', () => {
  const audit = auditStore(store({ product: { ...store().product, imageCount: 0 } }));
  assert.equal(get(audit, 'no-images').status, STATUS.ERROR);
});

test('too few product images is a warning', () => {
  const audit = auditStore(store({ product: { ...store().product, imageCount: 1 } }));
  assert.equal(get(audit, 'few-images').status, STATUS.WARNING);
  assert.match(get(audit, 'few-images').label, /1 product image/);
});

test('exactly the threshold number of images passes', () => {
  const audit = auditStore(
    store({ product: { ...store().product, imageCount: THRESHOLDS.IMAGES_MIN } })
  );
  assert.equal(has(audit, 'few-images'), false);
  assert.equal(has(audit, 'no-images'), false);
});

// --- Product copy ------------------------------------------------------------

test('a missing product description is flagged', () => {
  assert.ok(has(auditStore(store({ product: { ...store().product, description: '' } })), 'no-description'));
});

test('a thin product description is flagged', () => {
  const audit = auditStore(store({ product: { ...store().product, description: 'Nice bike.' } }));
  assert.equal(get(audit, 'thin-description').status, STATUS.WARNING);
});

// --- Stock -------------------------------------------------------------------

test('every variant out of stock is an error', () => {
  const audit = auditStore(
    store({ product: { ...store().product, availableVariantCount: 0 } })
  );
  assert.equal(get(audit, 'out-of-stock').status, STATUS.ERROR);
});

test('partial stock is information, not a problem', () => {
  const audit = auditStore(
    store({ product: { ...store().product, availableVariantCount: 1 } })
  );
  assert.equal(get(audit, 'partial-stock').status, STATUS.INFO);
  assert.match(get(audit, 'partial-stock').message, /1 of 2/);
});

test('a single-variant product is never reported as partially in stock', () => {
  const audit = auditStore(
    store({
      product: {
        ...store().product,
        variantCount: 1,
        availableVariantCount: 1,
        variants: [{ id: '1', sku: 'A', price: 1000, available: true }],
      },
    })
  );
  assert.equal(has(audit, 'partial-stock'), false);
});

// --- Merchandising -----------------------------------------------------------

test('variants without a SKU are counted and flagged', () => {
  const audit = auditStore(
    store({
      product: {
        ...store().product,
        variants: [
          { id: '1', sku: '', price: 1, available: true },
          { id: '2', sku: '', price: 2, available: true },
        ],
      },
    })
  );
  assert.equal(get(audit, 'missing-sku').status, STATUS.WARNING);
  assert.match(get(audit, 'missing-sku').label, /^2 variant/);
});

test('a compare-at price is reported as a sale with its percentage', () => {
  const audit = auditStore(
    store({ product: { ...store().product, priceFrom: 7500, compareAtPrice: 10000 } })
  );
  assert.equal(get(audit, 'on-sale').status, STATUS.INFO);
  assert.match(get(audit, 'on-sale').message, /25% off/);
});

test('a missing vendor is noted', () => {
  assert.ok(has(auditStore(store({ product: { ...store().product, vendor: '' } })), 'no-vendor'));
});

test('a theme that publishes no product data at all is flagged', () => {
  const audit = auditStore(store({ product: { ...store().product, source: 'none' } }));
  assert.equal(get(audit, 'no-product-data').status, STATUS.WARNING);
});

// --- Non-product pages -------------------------------------------------------

test('product checks do not run on a collection page', () => {
  const audit = auditStore(
    store({
      page: { type: 'collection' },
      product: { id: '', variantCount: 0, availableVariantCount: 0, imageCount: 0, variants: [] },
    })
  );
  assert.equal(has(audit, 'no-images'), false);
  assert.equal(has(audit, 'no-description'), false);
});

// --- describeStore additions -------------------------------------------------

const rowsOf = (description, label) =>
  description.groups.flatMap((group) => group.rows).find((row) => row.label === label);

test('the product section now carries title, handle, stock and images', () => {
  const description = describeStore(store());
  assert.equal(rowsOf(description, 'Title').value, 'Acme City Bike');
  assert.equal(rowsOf(description, 'Handle').value, 'bike');
  assert.equal(rowsOf(description, 'In stock').value, '2 of 2');
  assert.equal(rowsOf(description, 'Images').value, '5');
  assert.equal(rowsOf(description, 'Options').value, 'Size');
  assert.equal(rowsOf(description, 'Tags').value, 'city');
});

test('a compare-at price is shown with its discount note', () => {
  const description = describeStore(
    store({ product: { ...store().product, priceFrom: 7500, compareAtPrice: 10000 } })
  );
  assert.equal(rowsOf(description, 'Compare at').value, '100.00 EUR');
  assert.match(rowsOf(description, 'Compare at').note, /25% off/);
});

test('zero images is surfaced as a warning row', () => {
  const description = describeStore(store({ product: { ...store().product, imageCount: 0 } }));
  assert.equal(rowsOf(description, 'Images').status, STATUS.WARNING);
});

// --- What the page cannot tell us --------------------------------------------
//
// Found by running the collector against a real storefront: Allbirds publishes
// variants through analytics metadata, which carries no availability, no images
// and no copy. Judging that silence as "out of stock" and "no images" was a
// false alarm on a perfectly healthy product page.

const unknown = (overrides = {}) =>
  store({
    product: {
      ...store().product,
      knows: { images: false, description: false, stock: false },
      description: '',
      imageCount: 0,
      availableVariantCount: 0,
      variants: [
        { id: '1', title: 'S', sku: 'A-S', price: 19900, available: null },
        { id: '2', title: 'M', sku: 'A-M', price: 24900, available: null },
      ],
      source: 'analytics-meta',
      ...overrides,
    },
  });

test('unknown stock is not reported as out of stock', () => {
  const audit = auditStore(unknown());
  assert.equal(has(audit, 'out-of-stock'), false);
  assert.equal(has(audit, 'partial-stock'), false);
});

test('unknown images are not reported as missing images', () => {
  const audit = auditStore(unknown());
  assert.equal(has(audit, 'no-images'), false);
  assert.equal(has(audit, 'few-images'), false);
});

test('an unpublished description is not reported as a missing description', () => {
  const audit = auditStore(unknown());
  assert.equal(has(audit, 'no-description'), false);
  assert.equal(has(audit, 'thin-description'), false);
});

test('partial data is stated plainly instead, as information', () => {
  const audit = auditStore(unknown());
  assert.equal(get(audit, 'partial-product-data').status, STATUS.INFO);
});

test('a page that publishes nothing at all still gets its own warning', () => {
  const audit = auditStore(unknown({ source: 'none' }));
  assert.equal(get(audit, 'no-product-data').status, STATUS.WARNING);
  assert.equal(has(audit, 'partial-product-data'), false);
});

test('what the page does publish is still checked', () => {
  // SKUs come through analytics metadata, so that rule must still fire.
  const audit = auditStore(
    unknown({
      variants: [{ id: '1', title: 'S', sku: '', price: 19900, available: null }],
    })
  );
  assert.equal(get(audit, 'missing-sku').status, STATUS.WARNING);
});

test('a storefront with unknown data raises no errors at all', () => {
  assert.equal(auditStore(unknown()).summary.errors, 0);
});

test('the details view hides stock and images it cannot know', () => {
  const description = describeStore(unknown());
  const labels = description.groups.flatMap((group) => group.rows).map((row) => row.label);
  assert.equal(labels.includes('In stock'), false);
  assert.equal(labels.includes('Images'), false);
  assert.ok(labels.includes('Variants'));
});
