/**
 * Shopify storefront collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript() with world: 'MAIN'.
 * The MAIN world is required: window.Shopify and window.ShopifyAnalytics belong
 * to the page and are invisible from the isolated world.
 *
 * It must be entirely self-contained: no imports, no references to module scope.
 *
 * It reads what the storefront publishes about itself and makes no judgement.
 * The interpretation lives in src/lib/shopify.js, where it can be tested.
 *
 * @returns {object}
 */
export function collectStore() {
  const MAX_URLS = 400;
  const MAX_VARIANTS = 250;
  const MAX_IMAGES = 50;
  const MAX_SECTIONS = 60;

  const absolute = (href) => {
    if (!href) return '';
    try {
      return new URL(href, document.baseURI).href;
    } catch {
      return String(href);
    }
  };

  /** Reads a nested path off window without ever throwing. */
  const read = (path) => {
    try {
      let value = window;
      for (const key of path.split('.')) {
        if (value === null || value === undefined) return undefined;
        value = value[key];
      }
      return value;
    } catch {
      return undefined;
    }
  };

  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const id = (value) => (value === undefined || value === null ? '' : String(value));
  const has = (object, key) =>
    Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);

  // --- Storefront identity ---------------------------------------------------

  const theme = read('Shopify.theme') || {};
  const meta = read('ShopifyAnalytics.meta') || {};
  const page = meta.page || {};
  const analyticsProduct = meta.product || {};

  // --- Product JSON ----------------------------------------------------------

  /**
   * Themes publish the full product object in a JSON island. Names vary by
   * theme, so several conventions are tried before giving up.
   */
  const findProductJson = () => {
    const selectors = [
      'script[type="application/json"][id*="ProductJson"]',
      'script[type="application/json"][data-product-json]',
      'script[type="application/json"][id*="product-json"]',
      'script[data-product-json]',
      'product-info script[type="application/json"]',
    ];

    for (const selector of selectors) {
      for (const script of document.querySelectorAll(selector)) {
        try {
          const parsed = JSON.parse(script.textContent || '');
          if (parsed && typeof parsed === 'object' && (parsed.id || parsed.handle)) return parsed;
        } catch {
          // Malformed island; keep looking.
        }
      }
    }

    // Fall back to the product entity in JSON-LD. ProductGroup is what Shopify
    // now emits for anything with variants, and it does NOT end in "Product" -
    // matching on that suffix alone silently misses most modern storefronts.
    const PRODUCT_TYPES = new Set(['Product', 'ProductGroup', 'ProductModel', 'IndividualProduct']);
    const isProductType = (value) =>
      PRODUCT_TYPES.has(String(value || '').split(/[/#]/).filter(Boolean).pop());

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || '');
        const candidates = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed && parsed['@graph'])
            ? parsed['@graph']
            : [parsed];

        for (const entry of candidates) {
          const type = entry && entry['@type'];
          const types = Array.isArray(type) ? type : [type];
          if (types.some(isProductType)) return entry;
        }
      } catch {
        // Malformed JSON-LD; keep looking.
      }
    }

    return null;
  };

  const productJson = findProductJson();

  // JSON-LD prices are decimals ("105.00"); theme and analytics prices are
  // integer cents (10500). Everything below is normalised to cents, because
  // mixing the two would be a hundredfold error on every price shown.
  const offerOf = (node) => {
    const offers = node && node.offers;
    if (!offers) return null;
    return Array.isArray(offers) ? offers[0] : offers;
  };

  const offerPrice = (node) => {
    const offer = offerOf(node);
    if (!offer) return null;
    const raw = offer.price !== undefined ? offer.price : offer.lowPrice;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  };

  const offerAvailable = (node) => {
    const offer = offerOf(node);
    if (!offer || offer.availability === undefined) return null;
    return /InStock|LimitedAvailability|PreOrder|BackOrder/i.test(String(offer.availability));
  };

  // --- Variants --------------------------------------------------------------

  // Three sources, in order of richness. A ProductGroup's hasVariant entries are
  // reshaped to the theme JSON's field names so everything downstream is uniform.
  let variantSource = [];

  if (Array.isArray(productJson && productJson.variants)) {
    variantSource = productJson.variants;
  } else if (Array.isArray(productJson && productJson.hasVariant)) {
    // A ProductGroup's hasVariant mixes real variants with bare {@type, url}
    // references to the same variants. Counting the stubs would inflate the
    // variant count and make a healthy product look half out of stock.
    variantSource = productJson.hasVariant
      .filter((entry) => entry && (entry.offers || entry.sku || entry.name))
      .map((entry) => ({
        id: (entry && (entry['@id'] || entry.sku)) || '',
        title: entry && (entry.name || entry.title),
        sku: entry && entry.sku,
        price: offerPrice(entry),
        available: offerAvailable(entry),
      }));
  } else if (Array.isArray(analyticsProduct.variants)) {
    variantSource = analyticsProduct.variants;
  }

  const variants = [];
  let availableCount = 0;
  let knowsStock = false;

  for (const variant of variantSource.slice(0, MAX_VARIANTS)) {
    if (!variant || typeof variant !== 'object') continue;

    // null means "this source does not say", which is very different from false.
    const available =
      variant.available === undefined || variant.available === null
        ? null
        : Boolean(variant.available);
    if (available !== null) knowsStock = true;
    if (available) availableCount++;

    variants.push({
      id: id(variant.id),
      title: text(variant.title) || text(variant.public_title) || text(variant.name),
      sku: text(variant.sku),
      price: num(variant.price),
      compareAtPrice: num(variant.compare_at_price),
      available,
      inventoryQuantity: num(variant.inventory_quantity),
      inventoryPolicy: text(variant.inventory_policy),
      requiresShipping: variant.requires_shipping === undefined ? null : Boolean(variant.requires_shipping),
      barcode: text(variant.barcode),
    });
  }

  // --- Images and options ----------------------------------------------------

  const images = [];
  // Theme product JSON uses `images`; JSON-LD uses `image`, which may be a
  // single string, an array of strings, or ImageObject wrappers.
  const imageSource = Array.isArray(productJson && productJson.images)
    ? productJson.images
    : productJson && productJson.image
      ? [].concat(productJson.image)
      : [];

  for (const image of imageSource.slice(0, MAX_IMAGES)) {
    const src = typeof image === 'string' ? image : image && (image.src || image.url || image.contentUrl);
    const resolved = absolute(src);
    if (resolved && !images.includes(resolved)) images.push(resolved);
  }

  const options = [];
  if (Array.isArray(productJson && productJson.options)) {
    for (const option of productJson.options.slice(0, 10)) {
      if (typeof option === 'string') options.push({ name: option, values: [] });
      else if (option && typeof option === 'object') {
        options.push({
          name: text(option.name),
          values: Array.isArray(option.values) ? option.values.slice(0, 50).map(text) : [],
        });
      }
    }
  }

  // --- Theme sections and app extensions -------------------------------------

  const sections = [];
  for (const element of document.querySelectorAll('[data-section-type]')) {
    const type = text(element.getAttribute('data-section-type'));
    if (type && !sections.includes(type)) sections.push(type);
    if (sections.length >= MAX_SECTIONS) break;
  }

  const urls = [];
  for (const element of document.querySelectorAll('script[src], link[href]')) {
    if (urls.length >= MAX_URLS) break;
    const url = absolute(element.getAttribute('src') || element.getAttribute('href'));
    if (url && !urls.includes(url)) urls.push(url);
  }

  const metaTag = (name) => {
    const element = document.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]');
    return element ? text(element.getAttribute('content')) : '';
  };

  const canonical = document.querySelector('link[rel="canonical"]');

  // --- Markets and currency --------------------------------------------------

  const currencyRate = read('Shopify.currency.rate');
  const currencySelectors = document.querySelectorAll(
    'form[action*="/localization"], [name="currency_code"], [name="country_code"]'
  );

  return {
    url: location.href,
    origin: location.origin,
    title: document.title || '',

    hasShopifyGlobal: typeof read('Shopify') === 'object' && read('Shopify') !== null,

    shop: text(read('Shopify.shop')),
    locale: text(read('Shopify.locale')),
    country: text(read('Shopify.country')),
    currency: text(read('Shopify.currency.active')) || text(meta.currency),
    currencyRate: text(currencyRate) || (num(currencyRate) !== null ? String(currencyRate) : ''),
    hasLocalizationForm: currencySelectors.length > 0,
    moneyFormat: text(read('Shopify.money_format')),
    designMode: read('Shopify.designMode') === true,
    checkoutEnabled: typeof read('Shopify.checkout') === 'object' && read('Shopify.checkout') !== null,
    customerLoggedIn: Boolean(read('__st.cid') || page.customerId),
    cartCurrency: text(read('Shopify.currency.active')),

    theme: {
      id: id(theme.id),
      name: text(theme.name),
      role: text(theme.role),
      themeStoreId: theme.theme_store_id === undefined || theme.theme_store_id === null
        ? ''
        : String(theme.theme_store_id),
      schemaName: text(theme.schema_name),
      schemaVersion: text(theme.schema_version),
      sections,
    },

    page: {
      type: text(page.pageType),
      resourceType: text(page.resourceType),
      resourceId: id(page.resourceId),
    },

    product: {
      // `knows` says which questions this page can actually answer. Without it
      // the audit would report "no images" on a theme that simply never
      // publishes them, which is a false alarm, not a finding.
      knows: {
        images: Boolean(productJson && (has(productJson, 'images') || has(productJson, 'image'))),
        description: Boolean(
          productJson && (has(productJson, 'description') || has(productJson, 'body_html'))
        ),
        stock: knowsStock,
      },
      id: id(analyticsProduct.id || (productJson && productJson.id)),
      handle: text((productJson && productJson.handle) || analyticsProduct.handle),
      title: text(productJson && (productJson.title || productJson.name)),
      description: text(productJson && (productJson.description || productJson.body_html)).slice(0, 1000),
      vendor: text(analyticsProduct.vendor || (productJson && productJson.vendor)),
      type: text(analyticsProduct.type || (productJson && productJson.type)),
      tags: Array.isArray(productJson && productJson.tags) ? productJson.tags.slice(0, 50).map(text) : [],
      publishedAt: text(productJson && productJson.published_at),
      // Theme JSON carries `price` in cents; JSON-LD carries it under offers.
      priceFrom: num(productJson && productJson.price) ?? offerPrice(productJson),
      compareAtPrice: num(productJson && productJson.compare_at_price),
      available:
        productJson && productJson.available !== undefined
          ? Boolean(productJson.available)
          : offerAvailable(productJson),
      variantCount: variants.length,
      availableVariantCount: availableCount,
      imageCount: images.length,
      images: images.slice(0, 12),
      options,
      variants,
      source: productJson ? 'product-json' : analyticsProduct.id ? 'analytics-meta' : 'none',
    },

    seo: {
      description: metaTag('description'),
      canonical: canonical ? absolute(canonical.getAttribute('href')) : '',
      robots: metaTag('robots'),
      ogImage: metaTag('og:image'),
      ogType: metaTag('og:type'),
    },

    generator: metaTag('generator'),
    urls,
    collectedAt: new Date().toISOString(),
  };
}
