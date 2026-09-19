/**
 * Tracking signal collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript() with world: 'MAIN'.
 * The MAIN world is required: tracker globals such as window.fbq or window.ga
 * belong to the page and are invisible from the isolated world.
 *
 * It must be entirely self-contained: no imports, no references to module scope.
 *
 * It gathers raw evidence only - which globals exist, which scripts loaded,
 * which cookie NAMES are set - and never decides what any of it means. That is
 * src/lib/trackers.js, where it can be tested.
 *
 * Privacy: cookie names are read, cookie VALUES are never read. A cookie name
 * tells you a tracker is present; its value is the identifier itself, and this
 * extension has no reason to touch it.
 *
 * @returns {object}
 */
export function collectSignals() {
  const MAX_SCRIPTS = 300;
  const MAX_INLINE_TOTAL = 120000;
  const MAX_INLINE_EACH = 20000;

  const absolute = (href) => {
    if (!href) return '';
    try {
      return new URL(href, document.baseURI).href;
    } catch {
      return String(href);
    }
  };

  // --- Globals ---------------------------------------------------------------

  /** Every global a known tracker might install. Presence only, never contents. */
  const WATCHED = [
    'dataLayer', 'google_tag_manager', 'gtag', 'ga', 'GoogleAnalyticsObject',
    'fbq', '_fbq', 'ttq', 'twq', 'snaptr', 'pintrk', 'lintrk', 'uetq', 'rdt',
    'hj', 'hjSiteSettings', 'clarity', '_hsq', 'analytics', 'mixpanel',
    'amplitude', 'posthog', 'heap', 'Intercom', 'zE', 'drift', '_paq',
    'Matomo', 'plausible', 'fathom', 'umami', 'dataLayerGA4', 'Shopify',
    'ShopifyAnalytics', 'OneTrust', 'Cookiebot', 'Didomi', '__tcfapi',
    'axeptioSDK', 'UC_UI', 'Osano', 'truste', '_sp_', 'klaro', 'CookieConsent',
    'Sentry', 'newrelic', 'DD_RUM', 'LogRocket', 'FS', 'smartlook',
  ];

  const globals = [];
  for (const name of WATCHED) {
    try {
      if (typeof window[name] !== 'undefined' && window[name] !== null) globals.push(name);
    } catch {
      // Some globals throw on access behind a getter; treat as absent.
    }
  }

  // --- Scripts ---------------------------------------------------------------

  const scripts = [];
  let inline = '';

  for (const element of document.querySelectorAll('script')) {
    const src = element.getAttribute('src');

    if (src) {
      if (scripts.length < MAX_SCRIPTS) scripts.push(absolute(src));
      continue;
    }

    // Inline snippets are where tag IDs live. Long inline blobs are almost
    // always application bundles or JSON, not tracking snippets, so they are
    // skipped to keep the payload small.
    if (inline.length >= MAX_INLINE_TOTAL) continue;
    const text = element.textContent || '';
    if (text.length && text.length <= MAX_INLINE_EACH) inline += '\n' + text;
  }

  if (inline.length > MAX_INLINE_TOTAL) inline = inline.slice(0, MAX_INLINE_TOTAL);

  // --- Cookies ---------------------------------------------------------------

  const cookieNames = [];
  try {
    for (const pair of String(document.cookie || '').split(';')) {
      const name = pair.split('=')[0].trim();
      // Only the name. The value is the tracking identifier and is left alone.
      if (name && !cookieNames.includes(name)) cookieNames.push(name);
      if (cookieNames.length >= 200) break;
    }
  } catch {
    // document.cookie throws on some sandboxed pages.
  }

  // --- Frames ----------------------------------------------------------------

  const iframes = [];
  for (const element of document.querySelectorAll('iframe[src]')) {
    const src = absolute(element.getAttribute('src'));
    if (src && !iframes.includes(src)) iframes.push(src);
    if (iframes.length >= 100) break;
  }

  let gtmContainers = [];
  try {
    if (window.google_tag_manager) {
      gtmContainers = Object.keys(window.google_tag_manager).filter((key) => /^GTM-/.test(key));
    }
  } catch {
    gtmContainers = [];
  }

  return {
    url: location.href,
    origin: location.origin,
    title: document.title || '',
    globals,
    scripts,
    iframes,
    cookieNames,
    gtmContainers,
    inline,
    collectedAt: new Date().toISOString(),
  };
}
