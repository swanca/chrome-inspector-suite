import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectShopify,
  detectApps,
  formatPrice,
  priceRange,
  describeStore,
  toRows,
  APPS,
  CSV_HEADER,
  STATUS,
} from '../src/lib/shopify.js';

const store = (overrides = {}) => ({
  url: 'https://shop.example.com/products/bike',
  origin: 'https://shop.example.com',
  hasShopifyGlobal: true,
  shop: 'shop.example.com',
  locale: 'fr',
  country: 'FR',
  currency: 'EUR',
  designMode: false,
  customerLoggedIn: false,
  theme: {
    id: '123456789',
    name: 'Dawn',
    role: 'main',
    themeStoreId: '887',
    schemaName: 'Dawn',
    schemaVersion: '15.0.0',
  },
  page: { type: 'product', resourceType: 'product', resourceId: '999' },
  product: {
    id: '999',
    vendor: 'Acme',
    type: 'Bicycle',
    variantCount: 2,
    variants: [
      { id: '1', name: 'S', sku: 'A-S', price: 19900 },
      { id: '2', name: 'M', sku: 'A-M', price: 24900 },
    ],
  },
  urls: ['https://cdn.shopify.com/s/files/1/theme.js'],
  collectedAt: '2026-09-19T10:00:00.000Z',
  ...overrides,
});

const rowsOf = (description, label) =>
  description.groups.flatMap((group) => group.rows).find((row) => row.label === label);

// --- Detection ---------------------------------------------------------------

test('the Shopify global gives high confidence', () => {
  const result = detectShopify(store());
  assert.equal(result.isShopify, true);
  assert.equal(result.confidence, 'high');
  assert.ok(result.evidence.includes('window.Shopify'));
});

test('CDN assets alone give low confidence', () => {
  const result = detectShopify(store({ hasShopifyGlobal: false, shop: '' }));
  assert.equal(result.isShopify, true);
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.evidence, ['cdn.shopify.com']);
});

test('a non-Shopify page is recognised as such', () => {
  const result = detectShopify(
    store({ hasShopifyGlobal: false, shop: '', urls: ['https://example.com/app.js'] })
  );
  assert.equal(result.isShopify, false);
  assert.equal(result.confidence, 'none');
});

test('a lookalike CDN domain is not accepted', () => {
  const result = detectShopify(
    store({ hasShopifyGlobal: false, shop: '', urls: ['https://cdn.shopify.com.evil.test/x.js'] })
  );
  assert.equal(result.isShopify, false);
});

test('detectShopify rejects junk', () => {
  assert.throws(() => detectShopify(null), TypeError);
});

// --- Apps --------------------------------------------------------------------

test('app registry entries are well formed and unique', () => {
  const ids = APPS.map((app) => app.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const app of APPS) {
    assert.ok(app.name, app.id + ' has no name');
    assert.ok(app.host.includes('.'), app.id + ' has no host');
  }
});

test('apps are detected from the scripts they load', () => {
  const apps = detectApps([
    'https://static.klaviyo.com/onsite/js/klaviyo.js',
    'https://cdn1.judge.me/widget.js',
    'https://example.com/app.js',
  ]);
  assert.deepEqual(apps.map((app) => app.id).sort(), ['judgeme', 'klaviyo']);
});

test('an app lookalike domain is not detected', () => {
  assert.deepEqual(detectApps(['https://klaviyo.com.evil.test/x.js']), []);
});

test('detectApps tolerates junk', () => {
  assert.deepEqual(detectApps(null), []);
  assert.deepEqual(detectApps([]), []);
  assert.deepEqual(detectApps(['not a url']), []);
});

// --- Prices ------------------------------------------------------------------

test('prices are converted from integer cents', () => {
  // Shopify stores 19900 to mean 199.00 - reading it as euros would be a
  // hundredfold error on every price shown.
  assert.equal(formatPrice(19900, 'EUR'), '199.00 EUR');
  assert.equal(formatPrice(0, 'EUR'), '0.00 EUR');
  assert.equal(formatPrice(5, 'EUR'), '0.05 EUR');
  assert.equal(formatPrice(19900), '199.00');
});

test('formatPrice returns nothing for a missing price', () => {
  assert.equal(formatPrice(null, 'EUR'), '');
  assert.equal(formatPrice(undefined, 'EUR'), '');
  assert.equal(formatPrice('19900', 'EUR'), '');
  assert.equal(formatPrice(NaN, 'EUR'), '');
});

test('priceRange spans the variants', () => {
  assert.deepEqual(priceRange([{ price: 300 }, { price: 100 }, { price: 200 }]), {
    min: 100,
    max: 300,
  });
});

test('priceRange handles a single variant and ignores missing prices', () => {
  assert.deepEqual(priceRange([{ price: 100 }]), { min: 100, max: 100 });
  assert.deepEqual(priceRange([{ price: 100 }, { price: null }, {}]), { min: 100, max: 100 });
});

test('priceRange returns null when nothing is priced', () => {
  assert.equal(priceRange([]), null);
  assert.equal(priceRange([{ price: null }]), null);
  assert.equal(priceRange(null), null);
});

// --- describeStore -----------------------------------------------------------

test('a healthy store produces no warnings', () => {
  const description = describeStore(store());
  assert.equal(description.warnings, 0);
  assert.equal(rowsOf(description, 'Shop').value, 'shop.example.com');
  assert.equal(rowsOf(description, 'Theme').value, 'Dawn');
  assert.equal(rowsOf(description, 'Price').value, '199.00 EUR - 249.00 EUR');
});

test('a single-price product shows one price, not a range', () => {
  const description = describeStore(
    store({
      product: { id: '1', variantCount: 1, variants: [{ price: 19900 }] },
    })
  );
  assert.equal(rowsOf(description, 'Price').value, '199.00 EUR');
});

test('a theme with no Theme Store ID is reported as custom', () => {
  const description = describeStore(
    store({ theme: { ...store().theme, themeStoreId: '' } })
  );
  assert.equal(rowsOf(description, 'Origin').value, 'Custom theme');
});

test('a theme that is not live is a warning', () => {
  const description = describeStore(store({ theme: { ...store().theme, role: 'unpublished' } }));
  assert.equal(rowsOf(description, 'Role').status, STATUS.WARNING);
  assert.equal(description.warnings, 1);
});

test('design mode is flagged, because the page is the theme editor preview', () => {
  const description = describeStore(store({ designMode: true }));
  assert.equal(rowsOf(description, 'Design mode').status, STATUS.WARNING);
});

test('a product page with no product metadata is flagged', () => {
  const description = describeStore(
    store({ product: { id: '', variantCount: 0, variants: [] }, page: { type: 'product' } })
  );
  assert.equal(rowsOf(description, 'Product').status, STATUS.WARNING);
});

test('a non-product page simply has no product section', () => {
  const description = describeStore(
    store({ product: { id: '', variantCount: 0, variants: [] }, page: { type: 'collection' } })
  );
  assert.equal(description.groups.some((group) => group.id === 'product'), false);
});

test('a missing shop or currency is a warning', () => {
  const description = describeStore(store({ shop: '', currency: '' }));
  assert.equal(rowsOf(description, 'Shop').status, STATUS.WARNING);
  assert.equal(rowsOf(description, 'Currency').status, STATUS.WARNING);
});

test('empty groups are dropped rather than rendered blank', () => {
  const description = describeStore(
    store({ page: {}, product: { id: '', variantCount: 0, variants: [] } })
  );
  assert.deepEqual(description.groups.map((group) => group.id), ['store', 'theme']);
});

test('describeStore rejects junk', () => {
  assert.throws(() => describeStore(null), TypeError);
});

// --- Export ------------------------------------------------------------------

test('toRows emits a header then every field, apps included', () => {
  const description = describeStore(store());
  const rows = toRows(description, [{ id: 'klaviyo', name: 'Klaviyo' }]);

  assert.deepEqual(rows[0], [...CSV_HEADER]);
  assert.ok(rows.some((row) => row[1] === 'Shop' && row[2] === 'shop.example.com'));
  assert.ok(rows.some((row) => row[0] === 'Apps' && row[1] === 'Klaviyo'));
});

test('every row has the same width as the header', () => {
  const rows = toRows(describeStore(store()), []);
  for (const row of rows) assert.equal(row.length, CSV_HEADER.length);
});

test('toRows rejects a malformed description', () => {
  assert.throws(() => toRows(null), TypeError);
  assert.throws(() => toRows({}), TypeError);
});
