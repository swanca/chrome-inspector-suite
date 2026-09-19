import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TIERS,
  FEATURES,
  FREE_ROW_LIMIT,
  parseLicense,
  isExpired,
  coversExtension,
  featuresFor,
  can,
  rowLimit,
  verifyLicense,
  previewCount,
  previewShare,
  isGrandfathered,
  STORE_LIVE,
  GRANDFATHER_BEFORE,
  PRO_BY_DEFAULT,
  loadEntitlements,
} from '../shared/entitlements.js';
import { EXTENSIONS } from '../tools/extensions.mjs';

// --- A real key pair, so signatures are genuinely verified --------------------

const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);
const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);

const other = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

/** Signs a payload the way tools/make-license.mjs does. */
async function sign(payload, key = pair.privateKey) {
  const signed = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signed)
  );
  return signed + '.' + toBase64Url(new Uint8Array(signature));
}

const NOW = 1_800_000_000;
const payload = (overrides = {}) => ({
  v: 1,
  id: 'lic_test',
  sub: 'buyer@example.com',
  scope: 'suite',
  plan: 'pro',
  iat: NOW - 1000,
  exp: null,
  ...overrides,
});

// --- Catalogue integrity -----------------------------------------------------

test('every extension in the registry has a feature catalogue', () => {
  for (const extension of EXTENSIONS) {
    assert.ok(FEATURES[extension.slug], extension.slug + ' has no entry in FEATURES');
  }
});

test('every catalogue declares both lists and never gates the same feature twice', () => {
  for (const [slug, entry] of Object.entries(FEATURES)) {
    assert.ok(Array.isArray(entry.free), slug + '.free');
    assert.ok(Array.isArray(entry.pro), slug + '.pro');
    assert.ok(entry.pro.length > 0, slug + ' has nothing to sell');

    const overlap = entry.free.filter((feature) => entry.pro.includes(feature));
    assert.deepEqual(overlap, [], slug + ' lists ' + overlap.join(', ') + ' as both free and pro');
  }
});

test('copy is free everywhere, because a tool you cannot read is not worth installing', () => {
  for (const [slug, entry] of Object.entries(FEATURES)) {
    assert.ok(entry.free.includes('copy'), slug + ' does not offer free copy');
  }
});

// --- Gating ------------------------------------------------------------------

test('Pro unlocks everything', () => {
  for (const [slug, entry] of Object.entries(FEATURES)) {
    for (const feature of [...entry.free, ...entry.pro]) {
      assert.equal(can(slug, feature, TIERS.PRO), true, slug + '/' + feature);
    }
  }
});

test('Free allows the free list and blocks the pro list', () => {
  for (const [slug, entry] of Object.entries(FEATURES)) {
    for (const feature of entry.free) {
      assert.equal(can(slug, feature, TIERS.FREE), true, slug + '/' + feature);
    }
    for (const feature of entry.pro) {
      assert.equal(can(slug, feature, TIERS.FREE), false, slug + '/' + feature);
    }
  }
});

test('an undeclared feature defaults to free, so a typo cannot lock users out', () => {
  assert.equal(can('link-extractor', 'some-new-thing', TIERS.FREE), true);
  assert.equal(can('no-such-extension', 'anything', TIERS.FREE), true);
});

test('featuresFor returns empty lists for an unknown extension', () => {
  assert.deepEqual(featuresFor('nope'), { free: [], pro: [] });
});

test('the row cap applies to free and not to pro', () => {
  assert.equal(rowLimit(TIERS.FREE), FREE_ROW_LIMIT);
  assert.equal(rowLimit(TIERS.PRO), Infinity);
});

// --- parseLicense ------------------------------------------------------------

test('parseLicense reads a well-formed key', async () => {
  const parsed = parseLicense(await sign(payload()));
  assert.ok(parsed);
  assert.equal(parsed.payload.sub, 'buyer@example.com');
  assert.ok(parsed.signature instanceof Uint8Array);
});

test('parseLicense tolerates pasted whitespace and line breaks', async () => {
  const key = await sign(payload());
  const messy = '  ' + key.slice(0, 20) + '\n' + key.slice(20) + '  ';
  assert.ok(parseLicense(messy));
});

test('parseLicense rejects anything malformed without throwing', () => {
  assert.equal(parseLicense(''), null);
  assert.equal(parseLicense('no-dot'), null);
  assert.equal(parseLicense('.'), null);
  assert.equal(parseLicense('a.'), null);
  assert.equal(parseLicense('.b'), null);
  assert.equal(parseLicense('a.b.c'), null);
  assert.equal(parseLicense('!!!.!!!'), null);
  assert.equal(parseLicense(null), null);
  assert.equal(parseLicense(42), null);
});

test('parseLicense rejects a payload that is not an object', () => {
  const notObject = Buffer.from('"just a string"', 'utf8').toString('base64url');
  assert.equal(parseLicense(notObject + '.AAAA'), null);
});

// --- Expiry and scope --------------------------------------------------------

test('a perpetual license never expires', () => {
  assert.equal(isExpired(payload({ exp: null }), NOW), false);
  assert.equal(isExpired(payload({ exp: undefined }), NOW), false);
});

test('expiry is compared against the given time', () => {
  assert.equal(isExpired(payload({ exp: NOW + 10 }), NOW), false);
  assert.equal(isExpired(payload({ exp: NOW - 10 }), NOW), true);
  assert.equal(isExpired(payload({ exp: NOW }), NOW), true);
});

test('a nonsense expiry is treated as expired, never as perpetual', () => {
  assert.equal(isExpired(payload({ exp: 'soon' }), NOW), true);
  assert.equal(isExpired(payload({ exp: NaN }), NOW), true);
  assert.equal(isExpired(null, NOW), true);
});

test('a suite license covers every extension', () => {
  for (const extension of EXTENSIONS) {
    assert.equal(coversExtension(payload({ scope: 'suite' }), extension.slug), true);
  }
});

test('a single-extension license covers only that one', () => {
  const single = payload({ scope: 'link-extractor' });
  assert.equal(coversExtension(single, 'link-extractor'), true);
  assert.equal(coversExtension(single, 'table-to-csv'), false);
});

test('a license can list several extensions', () => {
  const pair2 = payload({ scope: ['link-extractor', 'table-to-csv'] });
  assert.equal(coversExtension(pair2, 'table-to-csv'), true);
  assert.equal(coversExtension(pair2, 'seo-inspector'), false);
});

test('coversExtension tolerates junk', () => {
  assert.equal(coversExtension(null, 'x'), false);
  assert.equal(coversExtension(payload(), ''), false);
});

// --- verifyLicense (real signatures) -----------------------------------------

test('a genuine key verifies', async () => {
  const result = await verifyLicense(await sign(payload()), publicJwk, 'link-extractor', NOW);
  assert.equal(result.valid, true);
  assert.equal(result.payload.sub, 'buyer@example.com');
});

test('a key signed with a different private key is rejected', async () => {
  // The whole point: only the seller's key can mint licenses.
  const forged = await sign(payload(), other.privateKey);
  const result = await verifyLicense(forged, publicJwk, 'link-extractor', NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason, /not genuine/i);
});

test('editing the payload invalidates the signature', async () => {
  const key = await sign(payload({ exp: NOW - 1 }));
  const [, signature] = key.split('.');

  // Swap the expired payload for a perpetual one, keeping the old signature.
  const tampered = Buffer.from(JSON.stringify(payload({ exp: null })), 'utf8').toString('base64url');
  const result = await verifyLicense(tampered + '.' + signature, publicJwk, 'link-extractor', NOW);

  assert.equal(result.valid, false);
  assert.match(result.reason, /not genuine/i);
});

test('an expired key is rejected even though its signature is genuine', async () => {
  const key = await sign(payload({ exp: NOW - 1 }));
  const result = await verifyLicense(key, publicJwk, 'link-extractor', NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason, /expired/i);
});

test('a key for another extension is rejected with a clear reason', async () => {
  const key = await sign(payload({ scope: 'table-to-csv' }));
  const result = await verifyLicense(key, publicJwk, 'link-extractor', NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason, /different extension/i);
});

test('a malformed key is rejected before any crypto runs', async () => {
  const result = await verifyLicense('nonsense', publicJwk, 'link-extractor', NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason, /license key/i);
});

test('an unusable public key fails closed rather than throwing', async () => {
  const result = await verifyLicense(await sign(payload()), { kty: 'oops' }, 'link-extractor', NOW);
  assert.equal(result.valid, false);
  assert.equal(result.payload, null);
});

test('every rejection carries a reason the popup can show', async () => {
  const cases = [
    ['nonsense', publicJwk],
    [await sign(payload(), other.privateKey), publicJwk],
    [await sign(payload({ exp: NOW - 1 })), publicJwk],
    [await sign(payload({ scope: 'table-to-csv' })), publicJwk],
  ];

  for (const [key, jwk] of cases) {
    const result = await verifyLicense(key, jwk, 'link-extractor', NOW);
    assert.equal(result.valid, false);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
  }
});

// --- Preview: showing half instead of hiding ---------------------------------

test('Pro sees every item of a gated list', () => {
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.PRO, 9), 9);
});

test('Free sees half of a previewable list, rounded up', () => {
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.FREE, 9), 5);
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.FREE, 8), 4);
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.FREE, 2), 1);
});

test('a single item is never reduced to nothing', () => {
  // Hiding the only finding would leave the user with an empty screen and no
  // idea what they are missing.
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.FREE, 1), 1);
});

test('a feature with no preview share stays fully hidden on Free', () => {
  assert.equal(previewCount('shopify-store-inspector', 'export-csv', TIERS.FREE, 9), 0);
  assert.equal(previewCount('page-to-markdown', 'front-matter', TIERS.FREE, 9), 0);
});

test('a free feature is never truncated', () => {
  assert.equal(previewCount('shopify-store-inspector', 'details', TIERS.FREE, 9), 9);
});

test('an empty list previews as nothing at either tier', () => {
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.FREE, 0), 0);
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.PRO, 0), 0);
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.FREE, -3), 0);
  assert.equal(previewCount('shopify-store-inspector', 'audit', TIERS.FREE, NaN), 0);
});

test('every previewable feature is one that is actually gated', () => {
  for (const [slug, entry] of Object.entries(FEATURES)) {
    for (const feature of Object.keys(entry.preview || {})) {
      assert.ok(
        entry.pro.includes(feature),
        slug + ' previews "' + feature + '", which is not a Pro feature'
      );
      assert.ok(previewShare(slug, feature) > 0, slug + '/' + feature + ' has no share');
    }
  }
});

test('previewShare is clamped to a sane fraction', () => {
  assert.equal(previewShare('shopify-store-inspector', 'audit'), 0.5);
  assert.equal(previewShare('shopify-store-inspector', 'export-csv'), 0);
  assert.equal(previewShare('no-such-extension', 'audit'), 0);
});

// --- Grandfathering ----------------------------------------------------------

test('grandfathering is inactive until a cutoff is set', () => {
  // Shipping it dormant is the whole point: the install date can only be
  // recorded going forward.
  assert.equal(isGrandfathered(1000, null), false);
  assert.equal(isGrandfathered(1000, undefined), false);
  assert.equal(isGrandfathered(Date.now()), false);
});

test('an install before the cutoff is grandfathered', () => {
  assert.equal(isGrandfathered(1000, 2000), true);
  assert.equal(isGrandfathered(1999, 2000), true);
});

test('an install at or after the cutoff is not', () => {
  assert.equal(isGrandfathered(2000, 2000), false);
  assert.equal(isGrandfathered(3000, 2000), false);
});

test('a missing or nonsense install date is never grandfathered', () => {
  assert.equal(isGrandfathered(0, 2000), false);
  assert.equal(isGrandfathered(-1, 2000), false);
  assert.equal(isGrandfathered(null, 2000), false);
  assert.equal(isGrandfathered('yesterday', 2000), false);
  assert.equal(isGrandfathered(NaN, 2000), false);
});

test('this build ships unlocked, with nothing to buy', () => {
  assert.equal(PRO_BY_DEFAULT, true);
  assert.equal(STORE_LIVE, false);
  assert.equal(GRANDFATHER_BEFORE, null);
});

test('an unlocked build grants Pro without touching chrome.storage', async () => {
  // There is no chrome.storage here. If loadEntitlements reached for it, this
  // would throw - which is exactly the property worth pinning down: the
  // unlocked path must not depend on storage being available.
  assert.equal(typeof globalThis.chrome, 'undefined');

  const result = await loadEntitlements({}, 'shopify-store-inspector');
  assert.equal(result.tier, TIERS.PRO);
  assert.equal(result.unlocked, true);
  assert.equal(result.early, false);
});

test('every gated feature opens at the tier an unlocked build grants', () => {
  for (const [slug, entry] of Object.entries(FEATURES)) {
    for (const feature of entry.pro) {
      assert.equal(can(slug, feature, TIERS.PRO), true, slug + '/' + feature);
    }
    for (const feature of entry.pro) {
      assert.equal(previewCount(slug, feature, TIERS.PRO, 7), 7, slug + '/' + feature);
    }
  }
});
