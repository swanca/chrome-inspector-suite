/**
 * GENERATED FILE - do not edit.
 * Source: shared/entitlements.js
 * Run `npm run sync` after changing the source.
 *
 * Licensing and feature gating, shared by every extension in this repository.
 *
 * ## Why it works this way
 *
 * The Chrome Web Store stopped processing payments in 2021, so a paid tier needs
 * its own licensing. A license *server* would contradict the promise these
 * extensions make - no backend, no network, no data collection - so licenses are
 * instead **signed offline and verified offline**:
 *
 *   1. A sale on Lemon Squeezy / Stripe / Gumroad triggers `tools/make-license.mjs`.
 *   2. That signs a small JSON payload with the ECDSA P-256 private key.
 *   3. The buyer pastes the resulting key into the extension.
 *   4. The extension verifies the signature against the embedded PUBLIC key.
 *
 * Nothing is ever sent anywhere. The extension works offline, and the private
 * key never leaves the seller's machine.
 *
 * The trade-off, stated plainly: an offline license cannot be revoked. A leaked
 * key keeps working until it expires. For a low-priced tool that is the right
 * trade; if revocation ever matters, add an optional periodic check and accept
 * the privacy cost.
 */

export const TIERS = Object.freeze({ FREE: 'free', PRO: 'pro' });

/**
 * Where the Pro button points.
 *
 * TODO before launch: replace with the real URL - a waitlist page while
 * STORE_LIVE is false, the checkout once it is true.
 */
export const STORE_URL = 'https://example.com/chrome-inspector-suite';

/**
 * Ships every feature unlocked.
 *
 * This is what the open-source build does. All the licensing machinery below is
 * present and tested, but nothing is withheld from anyone: the gates evaluate,
 * and every one of them opens.
 *
 * To introduce a paid tier later, set this to false AND set GRANDFATHER_BEFORE
 * to that same moment. Everyone who already installed then keeps what they have
 * and nothing is taken away, which is the difference between adding a paid tier
 * and being accused of paywalling a free tool.
 */
export const PRO_BY_DEFAULT = true;

/**
 * Whether Pro can actually be bought yet.
 *
 * false means the panel offers a waitlist instead of a checkout. Irrelevant
 * while PRO_BY_DEFAULT is true, since there is nothing to buy.
 */
export const STORE_LIVE = false;

/**
 * Everyone who installed before this instant keeps Pro for free, forever.
 *
 * null leaves it inactive. Set it to the moment you switch payment on, and
 * every existing user is grandfathered automatically.
 *
 * This has to ship in v1 even while inactive: the install date can only be
 * recorded going forward, so an extension published without it can never tell
 * afterwards who was there first.
 */
export const GRANDFATHER_BEFORE = null;

/** Where the license is kept. chrome.storage.local never leaves the device. */
const STORAGE_KEY = 'license';

/** When this device first opened the extension. Written once, never sent. */
const INSTALL_KEY = 'installedAt';

/**
 * The feature catalogue.
 *
 * `free` lists what works with no license. Everything else named in `pro` is
 * gated. The guiding rule: **inspection is always free** - if the extension
 * cannot show you the answer without paying, it is not worth installing. What
 * is paid is getting the answer *out* (file exports), and the deeper analysis
 * that takes real work to maintain.
 *
 * FREE_ROW_LIMIT caps what a free copy can carry, so the free tier stays useful
 * for a quick look without replacing the paid export.
 */
export const FREE_ROW_LIMIT = 50;

export const FEATURES = Object.freeze({
  'seo-inspector': {
    free: ['audit', 'copy', 'filters'],
    pro: ['export-json', 'social-preview'],
  },
  'tracking-inspector': {
    free: ['detect', 'copy', 'evidence'],
    pro: ['export-csv', 'tag-ids'],
    preview: { 'tag-ids': 0.5 },
  },
  'shopify-store-inspector': {
    free: ['details', 'apps', 'copy'],
    pro: ['export-csv', 'audit', 'variants'],
    preview: { audit: 0.5, variants: 0.5 },
  },
  'schema-inspector': {
    free: ['validate', 'copy', 'filters'],
    pro: ['export-json', 'raw-tree'],
    preview: { 'raw-tree': 0.5 },
  },
  'image-alt-inspector': {
    free: ['audit', 'copy', 'filters', 'thumbnails'],
    pro: ['export-csv'],
  },
  'datalayer-viewer': {
    free: ['browse', 'search', 'copy'],
    pro: ['export-json', 'refresh'],
  },
  'link-extractor': {
    free: ['extract', 'filters', 'copy'],
    pro: ['export-csv', 'uncapped'],
  },
  'page-to-markdown': {
    free: ['convert', 'copy'],
    pro: ['export-md', 'front-matter'],
  },
  'table-to-csv': {
    free: ['convert', 'preview', 'copy'],
    pro: ['export-csv', 'delimiter'],
  },
  'tech-stack-detector': {
    free: ['detect', 'copy'],
    pro: ['export-csv', 'evidence', 'versions'],
  },
});

// --- License parsing (pure) --------------------------------------------------

function base64UrlToBytes(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Splits a license key into its payload and signature without verifying it.
 *
 * A key is `base64url(payload JSON).base64url(signature)`.
 *
 * @param {string} key
 * @returns {{payload: object, signature: Uint8Array, signed: string}|null}
 *          null when the key is not even well formed.
 */
export function parseLicense(key) {
  if (typeof key !== 'string') return null;

  const trimmed = key.trim().replace(/\s+/g, '');
  const parts = trimmed.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(parts[0]));
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== 'object') return null;

    return { payload, signature: base64UrlToBytes(parts[1]), signed: parts[0] };
  } catch {
    return null;
  }
}

/**
 * Whether a payload has expired.
 * @param {object} payload
 * @param {number} [now] Epoch seconds, injectable for tests.
 */
export function isExpired(payload, now = Math.floor(Date.now() / 1000)) {
  if (!payload) return true;
  if (payload.exp === null || payload.exp === undefined) return false; // Perpetual.
  const exp = Number(payload.exp);
  return !Number.isFinite(exp) || exp <= now;
}

/**
 * Whether a payload licenses this particular extension.
 * A `suite` scope covers all of them.
 */
export function coversExtension(payload, slug) {
  if (!payload || !slug) return false;
  if (payload.scope === 'suite') return true;
  if (Array.isArray(payload.scope)) return payload.scope.includes(slug);
  return payload.scope === slug;
}

/** The feature lists for one extension. */
export function featuresFor(slug) {
  const entry = FEATURES[slug];
  return entry ? entry : { free: [], pro: [] };
}

/**
 * Whether a feature is available at a tier.
 *
 * Unknown features default to **free**: a gate must be declared deliberately,
 * never created by a typo.
 *
 * @param {string} slug
 * @param {string} feature
 * @param {string} tier One of TIERS
 */
export function can(slug, feature, tier) {
  if (tier === TIERS.PRO) return true;
  return !featuresFor(slug).pro.includes(feature);
}

/** The row cap that applies at a tier. Infinity for Pro. */
export function rowLimit(tier) {
  return tier === TIERS.PRO ? Infinity : FREE_ROW_LIMIT;
}

/**
 * The share of a gated list free users can see, as a fraction of the whole.
 * 0 means the feature is hidden outright.
 */
export function previewShare(slug, feature) {
  const entry = FEATURES[slug];
  const share = entry && entry.preview ? entry.preview[feature] : undefined;
  return typeof share === 'number' && share > 0 ? Math.min(share, 1) : 0;
}

/**
 * How many items of a gated list to show at a tier.
 *
 * Showing part of a paid list converts far better than hiding it: the user sees
 * exactly what they are missing instead of guessing. Because findings are
 * sorted worst-first, the half they do see is the half that matters.
 *
 * @param {string} slug
 * @param {string} feature
 * @param {string} tier
 * @param {number} total   How many items exist.
 * @returns {number} 0 when nothing may be shown, `total` for Pro.
 */
export function previewCount(slug, feature, tier, total) {
  const count = Number(total);
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (tier === TIERS.PRO) return count;
  if (can(slug, feature, tier)) return count;

  const share = previewShare(slug, feature);
  if (!share) return 0;

  // At least one, so a single-item list is never reduced to nothing.
  return Math.max(1, Math.min(count, Math.ceil(count * share)));
}

/**
 * Whether this install predates the switch to paid.
 * Pure, so the rule can be tested without touching storage.
 */
export function isGrandfathered(installedAt, cutoff = GRANDFATHER_BEFORE) {
  if (cutoff === null || cutoff === undefined) return false;

  const when = Number(installedAt);
  const limit = Number(cutoff);
  if (!Number.isFinite(when) || when <= 0) return false;
  if (!Number.isFinite(limit)) return false;

  return when < limit;
}

// --- Verification (WebCrypto) ------------------------------------------------

/**
 * Verifies a license key's signature and scope.
 *
 * @param {string} key       The pasted license key.
 * @param {object} publicJwk The embedded ECDSA P-256 public key, as JWK.
 * @param {string} slug      This extension's slug.
 * @param {number} [now]     Epoch seconds, injectable for tests.
 * @returns {Promise<{valid: boolean, reason: string, payload: object|null}>}
 */
export async function verifyLicense(key, publicJwk, slug, now) {
  const parsed = parseLicense(key);
  if (!parsed) return { valid: false, reason: 'That does not look like a license key.', payload: null };

  let ok = false;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      parsed.signature,
      new TextEncoder().encode(parsed.signed)
    );
  } catch {
    return { valid: false, reason: 'This key could not be checked.', payload: null };
  }

  if (!ok) return { valid: false, reason: 'This key is not genuine.', payload: null };
  if (!coversExtension(parsed.payload, slug)) {
    return { valid: false, reason: 'This key is for a different extension.', payload: parsed.payload };
  }
  if (isExpired(parsed.payload, now)) {
    return { valid: false, reason: 'This key has expired.', payload: parsed.payload };
  }

  return { valid: true, reason: '', payload: parsed.payload };
}

// --- Storage -----------------------------------------------------------------

/**
 * Reads the stored license and resolves the current tier.
 *
 * Any failure resolves to the free tier: a licensing problem must degrade to
 * "you get the free features", never to a broken popup.
 *
 * @param {object} publicJwk
 * @param {string} slug
 * @returns {Promise<{tier: string, payload: object|null, reason: string}>}
 */
export async function loadEntitlements(publicJwk, slug) {
  // The open-source build withholds nothing. Checked before storage is touched,
  // so an unlocked build works even where chrome.storage is unavailable.
  if (PRO_BY_DEFAULT) {
    return { tier: TIERS.PRO, payload: null, reason: '', early: false, unlocked: true };
  }

  let key = '';
  let installedAt = 0;

  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY, INSTALL_KEY]);
    key = stored && stored[STORAGE_KEY] ? String(stored[STORAGE_KEY]) : '';
    installedAt = stored && stored[INSTALL_KEY] ? Number(stored[INSTALL_KEY]) : 0;
  } catch {
    return { tier: TIERS.FREE, payload: null, reason: '', early: false, unlocked: false };
  }

  if (isGrandfathered(installedAt)) {
    return { tier: TIERS.PRO, payload: null, reason: '', early: true, unlocked: false };
  }

  if (!key) return { tier: TIERS.FREE, payload: null, reason: '', early: false, unlocked: false };

  const result = await verifyLicense(key, publicJwk, slug);
  return {
    tier: result.valid ? TIERS.PRO : TIERS.FREE,
    payload: result.payload,
    reason: result.reason,
    early: false,
    unlocked: false,
  };
}

/**
 * Records when this device first opened the extension, once.
 *
 * Written on every boot but never overwritten, so the value is the genuine
 * first run. It exists only to grandfather early users later; nothing reads it
 * off the device.
 *
 * @param {number} [now] Injectable for tests.
 * @returns {Promise<number>} The stored timestamp, or 0 if storage is unusable.
 */
export async function rememberInstall(now = Date.now()) {
  try {
    const stored = await chrome.storage.local.get(INSTALL_KEY);
    const existing = stored && stored[INSTALL_KEY] ? Number(stored[INSTALL_KEY]) : 0;
    if (Number.isFinite(existing) && existing > 0) return existing;

    await chrome.storage.local.set({ [INSTALL_KEY]: now });
    return now;
  } catch {
    return 0;
  }
}

/** Stores a license key. Returns whether it was accepted. */
export async function saveLicense(key, publicJwk, slug) {
  const result = await verifyLicense(key, publicJwk, slug);
  if (!result.valid) return result;

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: String(key).trim() });
  } catch {
    return { valid: false, reason: 'Could not save the key on this device.', payload: null };
  }
  return result;
}

/** Removes the stored license. */
export async function clearLicense() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
