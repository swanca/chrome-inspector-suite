/**
 * Shopify storefront interpretation.
 *
 * Pure functions: collected storefront data in, readable facts out. No DOM, no
 * chrome.* APIs - which is what makes this file directly unit-testable.
 */

export const STATUS = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
});

/** Shopify's own asset domains, used as the fallback signal. */
const SHOPIFY_HOSTS = ['cdn.shopify.com', 'cdn.shopifycloud.com', 'shopifycdn.net'];

/** Apps recognised by the scripts they load. `host` is matched as a domain. */
export const APPS = Object.freeze([
  { id: 'klaviyo', name: 'Klaviyo', host: 'klaviyo.com' },
  { id: 'judgeme', name: 'Judge.me', host: 'judge.me' },
  { id: 'loox', name: 'Loox', host: 'loox.io' },
  { id: 'yotpo', name: 'Yotpo', host: 'yotpo.com' },
  { id: 'okendo', name: 'Okendo', host: 'okendo.io' },
  { id: 'stamped', name: 'Stamped', host: 'stamped.io' },
  { id: 'recharge', name: 'Recharge', host: 'rechargecdn.com' },
  { id: 'gorgias', name: 'Gorgias', host: 'gorgias.chat' },
  { id: 'tidio', name: 'Tidio', host: 'tidio.co' },
  { id: 'smile', name: 'Smile.io', host: 'smile.io' },
  { id: 'privy', name: 'Privy', host: 'privy.com' },
  { id: 'attentive', name: 'Attentive', host: 'attentivemobile.com' },
  { id: 'postscript', name: 'Postscript', host: 'postscript.io' },
  { id: 'pagefly', name: 'PageFly', host: 'pagefly.io' },
  { id: 'shogun', name: 'Shogun', host: 'getshogun.com' },
  { id: 'rebuy', name: 'Rebuy', host: 'rebuyengine.com' },
  { id: 'zipify', name: 'Zipify', host: 'zipify.com' },
  { id: 'vitals', name: 'Vitals', host: 'vitals.co' },
  { id: 'boost', name: 'Boost AI Search', host: 'bc-sf-filter.com' },
  { id: 'searchanise', name: 'Searchanise', host: 'searchserverapi.com' },
  { id: 'route', name: 'Route', host: 'route.com' },
  { id: 'luckyorange', name: 'Lucky Orange', host: 'luckyorange.com' },
  { id: 'backinstock', name: 'Back in Stock', host: 'backinstock.org' },
  { id: 'wiser', name: 'Wiser', host: 'expertvillagemedia.com' },
  { id: 'gempages', name: 'GemPages', host: 'gempages.net' },
  { id: 'omnisend', name: 'Omnisend', host: 'omnisend.com' },
  { id: 'mailchimp', name: 'Mailchimp', host: 'chimpstatic.com' },
  { id: 'bold', name: 'Bold Commerce', host: 'boldapps.net' },
  { id: 'loop', name: 'Loop Returns', host: 'loopreturns.com' },
  { id: 'returnly', name: 'Returnly', host: 'returnly.com' },
  { id: 'shipbob', name: 'ShipBob', host: 'shipbob.com' },
  { id: 'aftership', name: 'AfterShip', host: 'aftership.com' },
  { id: 'reviewsio', name: 'REVIEWS.io', host: 'reviews.io' },
  { id: 'trustpilot', name: 'Trustpilot', host: 'trustpilot.com' },
  { id: 'gorgias-convert', name: 'Gorgias Convert', host: 'gorgias.com' },
  { id: 'octaneai', name: 'Octane AI', host: 'octaneai.com' },
  { id: 'nosto', name: 'Nosto', host: 'nosto.com' },
  { id: 'dynamicyield', name: 'Dynamic Yield', host: 'dynamicyield.com' },
  { id: 'limespot', name: 'LimeSpot', host: 'limespot.com' },
  { id: 'justuno', name: 'Justuno', host: 'justuno.com' },
  { id: 'wisepops', name: 'Wisepops', host: 'wisepops.net' },
  { id: 'swell', name: 'Yotpo Loyalty', host: 'swellrewards.com' },
  { id: 'growave', name: 'Growave', host: 'growave.io' },
  { id: 'hextom', name: 'Hextom', host: 'hextom.com' },
  { id: 'avada', name: 'Avada', host: 'avada.io' },
  { id: 'tapcart', name: 'Tapcart', host: 'tapcart.com' },
  { id: 'searchspring', name: 'Searchspring', host: 'searchspring.io' },
  { id: 'algolia', name: 'Algolia', host: 'algolia.net' },
  { id: 'klarna', name: 'Klarna', host: 'klarna.com' },
  { id: 'afterpay', name: 'Afterpay / Clearpay', host: 'afterpay.com' },
  { id: 'affirm', name: 'Affirm', host: 'affirm.com' },
]);

/** Product-page quality thresholds, exported so tests cannot drift from them. */
export const THRESHOLDS = Object.freeze({
  DESCRIPTION_MIN: 120,
  IMAGES_MIN: 3,
  SEO_DESCRIPTION_MIN: 70,
  SEO_DESCRIPTION_MAX: 160,
});

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** True when host is the domain itself or a subdomain - never a lookalike. */
function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

/**
 * Whether this page is a Shopify storefront, and how confident we are.
 *
 * @param {object} data Output of collectStore().
 * @returns {{isShopify: boolean, confidence: 'high'|'low'|'none', evidence: Array<string>}}
 */
export function detectShopify(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('detectShopify() requires collected store data.');
  }

  const evidence = [];
  if (data.hasShopifyGlobal) evidence.push('window.Shopify');
  if (data.shop) evidence.push('shop: ' + data.shop);

  const hosts = (Array.isArray(data.urls) ? data.urls : []).map(hostOf).filter(Boolean);
  for (const domain of SHOPIFY_HOSTS) {
    if (hosts.some((host) => hostMatches(host, domain))) {
      evidence.push(domain);
      break;
    }
  }

  if (!evidence.length) return { isShopify: false, confidence: 'none', evidence };

  return {
    isShopify: true,
    confidence: data.hasShopifyGlobal ? 'high' : 'low',
    evidence,
  };
}

/**
 * Shopify stores prices as integer cents. Formats them for display.
 *
 * @param {number|null} cents
 * @param {string} [currency]
 * @returns {string}
 */
export function formatPrice(cents, currency) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';

  const amount = (cents / 100).toFixed(2);
  return currency ? amount + ' ' + currency : amount;
}

/**
 * The price range across a product's variants.
 *
 * @param {Array<{price: number|null}>} variants
 * @returns {{min: number, max: number}|null}
 */
export function priceRange(variants) {
  if (!Array.isArray(variants)) return null;

  const prices = variants
    .map((variant) => (variant && typeof variant.price === 'number' ? variant.price : null))
    .filter((price) => price !== null && Number.isFinite(price));

  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/**
 * Identifies the Shopify apps whose scripts the page loads.
 *
 * @param {Array<string>} urls
 * @returns {Array<{id: string, name: string}>}
 */
export function detectApps(urls) {
  if (!Array.isArray(urls)) return [];

  const hosts = urls.map(hostOf).filter(Boolean);

  return APPS.filter((app) => hosts.some((host) => hostMatches(host, app.host))).map((app) => ({
    id: app.id,
    name: app.name,
  }));
}

function row(label, value, status = STATUS.INFO, note = '') {
  return { label, value: value === null || value === undefined ? '' : String(value), status, note };
}

/**
 * Turns the raw capture into the rows the popup displays.
 *
 * @param {object} data Output of collectStore().
 * @returns {{groups: Array<{id, label, rows: Array}>, warnings: number}}
 */
export function describeStore(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('describeStore() requires collected store data.');
  }

  const theme = data.theme || {};
  const page = data.page || {};
  const product = data.product || {};
  const currency = data.currency || '';

  const store = [
    row('Shop', data.shop || '(unknown)', data.shop ? STATUS.OK : STATUS.WARNING),
    row('Currency', currency || '(unknown)', currency ? STATUS.OK : STATUS.WARNING),
  ];
  if (data.locale) store.push(row('Locale', data.locale));
  if (data.country) store.push(row('Country', data.country));
  store.push(
    row(
      'Customer',
      data.customerLoggedIn ? 'Logged in' : 'Guest',
      data.customerLoggedIn ? STATUS.INFO : STATUS.OK
    )
  );

  const themeRows = [
    row('Theme', theme.name || theme.schemaName || '(unknown)', theme.name ? STATUS.OK : STATUS.WARNING),
  ];
  if (theme.schemaVersion) themeRows.push(row('Version', theme.schemaVersion));
  if (theme.id) themeRows.push(row('Theme ID', theme.id));
  if (theme.themeStoreId) {
    themeRows.push(row('Theme Store ID', theme.themeStoreId, STATUS.INFO, 'Paid or free theme from the Shopify Theme Store.'));
  } else if (theme.name) {
    themeRows.push(row('Origin', 'Custom theme', STATUS.INFO, 'No Theme Store ID, so this theme is bespoke.'));
  }
  if (theme.role) {
    themeRows.push(
      row(
        'Role',
        theme.role,
        theme.role === 'main' ? STATUS.OK : STATUS.WARNING,
        theme.role === 'main' ? '' : 'This is not the live theme.'
      )
    );
  }
  if (data.designMode) {
    themeRows.push(
      row('Design mode', 'On', STATUS.WARNING, 'The page is being viewed inside the theme editor.')
    );
  }

  const pageRows = [];
  if (page.type) pageRows.push(row('Page type', page.type));
  if (page.resourceType) pageRows.push(row('Resource', page.resourceType));
  if (page.resourceId) pageRows.push(row('Resource ID', page.resourceId));

  const productRows = [];
  if (product.id) {
    if (product.title) productRows.push(row('Title', product.title));
    productRows.push(row('Product ID', product.id));
    if (product.handle) productRows.push(row('Handle', product.handle));
    if (product.vendor) productRows.push(row('Vendor', product.vendor));
    if (product.type) productRows.push(row('Type', product.type));
    productRows.push(
      row(
        'Variants',
        product.variantCount,
        product.variantCount > 0 ? STATUS.OK : STATUS.WARNING
      )
    );

    // Only report stock and images when the page actually publishes them.
    const knows = product.knows || {};

    if (knows.stock && product.variantCount > 0) {
      productRows.push(
        row(
          'In stock',
          product.availableVariantCount + ' of ' + product.variantCount,
          product.availableVariantCount > 0 ? STATUS.OK : STATUS.WARNING
        )
      );
    }

    if (knows.images) {
      productRows.push(
        row('Images', product.imageCount, product.imageCount > 0 ? STATUS.OK : STATUS.WARNING)
      );
    }

    const range = priceRange(product.variants);
    if (range) {
      productRows.push(
        row(
          'Price',
          range.min === range.max
            ? formatPrice(range.min, currency)
            : formatPrice(range.min, currency) + ' - ' + formatPrice(range.max, currency)
        )
      );
    }

    const discount = discountPercent(product.priceFrom, product.compareAtPrice);
    if (discount !== null) {
      productRows.push(
        row('Compare at', formatPrice(product.compareAtPrice, currency), STATUS.INFO, discount + '% off.')
      );
    }

    if (Array.isArray(product.options) && product.options.length) {
      productRows.push(
        row('Options', product.options.map((option) => option.name).filter(Boolean).join(', '))
      );
    }

    if (Array.isArray(product.tags) && product.tags.length) {
      productRows.push(row('Tags', product.tags.slice(0, 8).join(', ')));
    }
  } else if (page.type === 'product') {
    productRows.push(
      row('Product', 'Not exposed', STATUS.WARNING, 'This is a product page but no product metadata was published.')
    );
  }

  const groups = [
    { id: 'store', label: 'Store', rows: store },
    { id: 'theme', label: 'Theme', rows: themeRows },
    { id: 'page', label: 'Page', rows: pageRows },
    { id: 'product', label: 'Product', rows: productRows },
  ].filter((group) => group.rows.length);

  const warnings = groups.reduce(
    (total, group) => total + group.rows.filter((item) => item.status === STATUS.WARNING).length,
    0
  );

  return { groups, warnings };
}

/**
 * The discount implied by a compare-at price, as a whole percentage.
 *
 * @param {number|null} price
 * @param {number|null} compareAtPrice
 * @returns {number|null} null when there is no genuine discount.
 */
export function discountPercent(price, compareAtPrice) {
  if (typeof price !== 'number' || typeof compareAtPrice !== 'number') return null;
  if (!Number.isFinite(price) || !Number.isFinite(compareAtPrice)) return null;
  if (compareAtPrice <= 0 || compareAtPrice <= price) return null;

  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/** Platform capabilities the storefront reveals about itself. */
export function detectPlatformFeatures(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('detectPlatformFeatures() requires collected store data.');
  }

  const urls = Array.isArray(data.urls) ? data.urls : [];
  const features = [];

  if (data.hasLocalizationForm) {
    features.push({
      id: 'markets',
      name: 'Shopify Markets',
      note: 'The storefront offers a country or currency selector.',
    });
  }

  // Theme app extensions are served from a versioned /extensions/ path.
  if (urls.some((url) => /cdn\.shopify\.com\/extensions\//i.test(String(url)))) {
    features.push({
      id: 'theme-app-extensions',
      name: 'Theme app extensions',
      note: 'At least one app injects blocks through the theme editor rather than by editing code.',
    });
  }

  if (urls.some((url) => /shop_pay|shopifycloud\/shop_pay/i.test(String(url)))) {
    features.push({ id: 'shop-pay', name: 'Shop Pay', note: 'Accelerated checkout is enabled.' });
  }

  if (data.theme && Array.isArray(data.theme.sections) && data.theme.sections.length) {
    features.push({
      id: 'os2',
      name: 'Online Store 2.0 sections',
      note: data.theme.sections.length + ' section types render on this page.',
    });
  }

  return features;
}

function finding(id, status, label, message) {
  return { id, status, label, message };
}

/**
 * Actionable findings about this storefront, worst first.
 *
 * This is the part a merchant or an agency actually acts on, so each finding
 * names the problem and why it matters rather than just reporting a value.
 *
 * @param {object} data Output of collectStore().
 * @returns {{findings: Array, summary: object}}
 */
export function auditStore(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('auditStore() requires collected store data.');
  }

  const product = data.product || {};
  const seo = data.seo || {};
  const theme = data.theme || {};
  const page = data.page || {};
  const findings = [];

  // --- Theme ---
  if (data.designMode) {
    findings.push(
      finding('design-mode', STATUS.WARNING, 'Theme editor preview',
        'You are viewing this page inside the theme editor, so what you see may not be live.')
    );
  }
  if (theme.role && theme.role !== 'main') {
    findings.push(
      finding('theme-role', STATUS.WARNING, 'Not the live theme',
        'This page renders the "' + theme.role + '" theme, not the published one.')
    );
  }

  // --- SEO ---
  if (String(seo.robots || '').toLowerCase().includes('noindex')) {
    findings.push(
      finding('noindex', STATUS.ERROR, 'Page is set to noindex',
        'Search engines are told not to index this page.')
    );
  }
  if (!seo.canonical) {
    findings.push(
      finding('canonical', STATUS.WARNING, 'No canonical URL',
        'Shopify generates duplicate URLs for products in collections; a canonical prevents them competing.')
    );
  }

  const description = String(seo.description || '');
  if (!description) {
    findings.push(
      finding('meta-description', STATUS.WARNING, 'No meta description',
        'Shopify falls back to the first words of the product description, which rarely reads well.')
    );
  } else if (description.length < THRESHOLDS.SEO_DESCRIPTION_MIN) {
    findings.push(
      finding('meta-description-short', STATUS.WARNING, 'Meta description is short',
        description.length + ' characters. Aim for ' + THRESHOLDS.SEO_DESCRIPTION_MIN + '-' +
          THRESHOLDS.SEO_DESCRIPTION_MAX + '.')
    );
  }

  // --- Product page ---
  const isProductPage = page.type === 'product' || Boolean(product.id);

  if (isProductPage) {
    // What this page can actually tell us. A rule that fires on data the theme
    // never published is a false alarm, not a finding - so each block below is
    // gated on the corresponding `knows` flag.
    const knows = product.knows || {};

    if (product.source === 'none') {
      findings.push(
        finding('no-product-data', STATUS.WARNING, 'Product data not published',
          'Neither a product JSON island nor analytics metadata was found, so this theme hides its product data.')
      );
    } else if (!knows.images && !knows.description) {
      findings.push(
        finding('partial-product-data', STATUS.INFO, 'Only partial product data published',
          'This theme exposes variants but not images or copy, so those cannot be checked from the page.')
      );
    }

    if (knows.images) {
      if (product.imageCount === 0) {
        findings.push(
          finding('no-images', STATUS.ERROR, 'No product images',
            'A product page with no images will not convert and cannot appear in Google Shopping.')
        );
      } else if (product.imageCount < THRESHOLDS.IMAGES_MIN) {
        findings.push(
          finding('few-images', STATUS.WARNING, 'Only ' + product.imageCount + ' product image(s)',
            'Aim for at least ' + THRESHOLDS.IMAGES_MIN + ' so buyers can see the product properly.')
        );
      }
    }

    if (knows.description) {
      const body = String(product.description || '');
      if (!body) {
        findings.push(
          finding('no-description', STATUS.WARNING, 'No product description',
            'Nothing for search engines to index and nothing to answer buyer questions.')
        );
      } else if (body.length < THRESHOLDS.DESCRIPTION_MIN) {
        findings.push(
          finding('thin-description', STATUS.WARNING, 'Thin product description',
            body.length + ' characters. Thin copy ranks poorly and leaves questions unanswered.')
        );
      }
    }

    if (knows.stock && product.variantCount > 0 && product.availableVariantCount === 0) {
      findings.push(
        finding('out-of-stock', STATUS.ERROR, 'Every variant is out of stock',
          'All ' + product.variantCount + ' variants are unavailable.')
      );
    } else if (
      knows.stock &&
      product.variantCount > 1 &&
      product.availableVariantCount > 0 &&
      product.availableVariantCount < product.variantCount
    ) {
      findings.push(
        finding('partial-stock', STATUS.INFO, 'Partially out of stock',
          product.availableVariantCount + ' of ' + product.variantCount + ' variants are available.')
      );
    }

    const missingSku = (product.variants || []).filter((variant) => !variant.sku).length;
    if (missingSku > 0) {
      findings.push(
        finding('missing-sku', STATUS.WARNING, missingSku + ' variant(s) without a SKU',
          'SKUs are required by most feeds, fulfilment apps and marketplaces.')
      );
    }

    const discount = discountPercent(product.priceFrom, product.compareAtPrice);
    if (discount !== null) {
      findings.push(
        finding('on-sale', STATUS.INFO, 'On sale',
          discount + '% off the compare-at price.')
      );
    }

    if (!product.vendor) {
      findings.push(
        finding('no-vendor', STATUS.INFO, 'No vendor set',
          'Vendor drives brand filtering and several product feeds.')
      );
    }
  }

  const order = { error: 0, warning: 1, info: 2, ok: 3 };
  findings.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const summary = {
    total: findings.length,
    errors: findings.filter((item) => item.status === STATUS.ERROR).length,
    warnings: findings.filter((item) => item.status === STATUS.WARNING).length,
    infos: findings.filter((item) => item.status === STATUS.INFO).length,
  };
  summary.status = summary.errors ? STATUS.ERROR : summary.warnings ? STATUS.WARNING : STATUS.OK;

  return { findings, summary };
}

export const CSV_HEADER = Object.freeze(['section', 'field', 'value']);

/** Shapes the described store into CSV rows, header included. */
export function toRows(description, apps = []) {
  if (!description || !Array.isArray(description.groups)) {
    throw new TypeError('toRows() requires a described store.');
  }

  const rows = [[...CSV_HEADER]];

  for (const group of description.groups) {
    for (const item of group.rows) rows.push([group.label, item.label, item.value]);
  }
  for (const app of apps) rows.push(['Apps', app.name, 'detected']);

  return rows;
}
