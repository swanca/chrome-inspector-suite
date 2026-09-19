/**
 * Technology signal collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript() with world: 'MAIN'.
 * The MAIN world is required: framework globals such as window.React or
 * window.__NEXT_DATA__ belong to the page and are invisible from the isolated
 * world a content script normally runs in.
 *
 * It must be entirely self-contained: no imports, no references to module scope.
 *
 * It gathers evidence without interpreting it. Naming the technologies is
 * src/lib/stack.js, where it can be tested.
 *
 * @returns {object}
 */
export function collectSignals() {
  const MAX_URLS = 300;

  const absolute = (href) => {
    if (!href) return '';
    try {
      return new URL(href, document.baseURI).href;
    } catch {
      return String(href);
    }
  };

  const has = (name) => {
    try {
      return typeof window[name] !== 'undefined' && window[name] !== null;
    } catch {
      return false;
    }
  };

  /** Reads a nested version string without throwing on anything. */
  const version = (path) => {
    try {
      let value = window;
      for (const key of path.split('.')) {
        if (value === null || value === undefined) return '';
        value = value[key];
      }
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  };

  // --- Globals ---------------------------------------------------------------

  const WATCHED = [
    'React', 'ReactDOM', '__REACT_DEVTOOLS_GLOBAL_HOOK__', '__NEXT_DATA__', 'next',
    'Vue', '__VUE__', '__VUE_DEVTOOLS_GLOBAL_HOOK__', '__NUXT__', '$nuxt',
    'ng', 'angular', 'getAllAngularRootElements', '__svelte', '__sveltekit',
    'Ember', 'Backbone', 'Alpine', 'htmx', 'Stimulus', 'Turbo', 'Livewire',
    'jQuery', '$', '_', 'axios', 'moment', 'dayjs', 'gsap', 'THREE', 'd3',
    'bootstrap', 'Swiper', 'AOS', 'Lottie', 'lottie',
    'Shopify', 'Squarespace', 'wixPerformanceMeasurements', 'Webflow', 'Drupal',
    'wp', 'elementorFrontend', 'woocommerce_params', 'PrestaShop', 'Magento',
    'webpackChunk', '__webpack_require__', '__vite__', '__remixContext',
    'astro', '__astro', 'Blazor', 'Sentry', 'dataLayer',
  ];

  const globals = [];
  for (const name of WATCHED) if (has(name)) globals.push(name);

  // Webpack and Vite name their chunk registries dynamically.
  try {
    for (const key of Object.keys(window)) {
      if (/^webpackChunk/.test(key) && !globals.includes('webpackChunk')) globals.push('webpackChunk');
      if (/^__NUXT/.test(key) && !globals.includes('__NUXT__')) globals.push('__NUXT__');
    }
  } catch {
    // Enumerating window can throw on hardened pages; the fixed list suffices.
  }

  // --- Versions --------------------------------------------------------------

  const versions = {
    react: version('React.version'),
    vue: version('Vue.version'),
    jquery: version('jQuery.fn.jquery'),
    angularjs: version('angular.version.full'),
    alpine: version('Alpine.version'),
    d3: version('d3.version'),
    moment: version('moment.version'),
  };

  // Angular (2+) writes its version onto the root element instead.
  const ngRoot = document.querySelector('[ng-version]');
  if (ngRoot) versions.angular = ngRoot.getAttribute('ng-version') || '';

  // --- DOM markers -----------------------------------------------------------

  const MARKERS = [
    ['data-reactroot', '[data-reactroot]'],
    ['next-root', '#__next'],
    ['nuxt-root', '#__nuxt, #__nuxt_layout'],
    ['vue-app', '[data-v-app]'],
    ['ng-version', '[ng-version]'],
    ['angularjs', '[ng-app], [data-ng-app]'],
    ['svelte', '[class*="svelte-"]'],
    ['astro', '[astro-island], astro-island'],
    ['livewire', '[wire\\:id]'],
    ['turbo', '[data-turbo]'],
    ['stimulus', '[data-controller]'],
    ['htmx', '[hx-get], [hx-post], [data-hx-get]'],
    ['alpine', '[x-data]'],
    ['elementor', '.elementor-widget'],
    ['gravity-forms', '.gform_wrapper'],
    ['woocommerce', '.woocommerce'],
    ['bootstrap', '.container-fluid, .navbar-toggler'],
    ['tailwind', '.flex.items-center, .sr-only'],
  ];

  const markers = [];
  for (const [id, selector] of MARKERS) {
    try {
      if (document.querySelector(selector)) markers.push(id);
    } catch {
      // A selector unsupported by this browser must not stop the rest.
    }
  }

  // --- Resources -------------------------------------------------------------

  const urls = [];
  for (const element of document.querySelectorAll('script[src], link[href]')) {
    if (urls.length >= MAX_URLS) break;
    const url = absolute(element.getAttribute('src') || element.getAttribute('href'));
    if (url && !urls.includes(url)) urls.push(url);
  }

  const meta = (name) => {
    const element = document.querySelector('meta[name="' + name + '"]');
    return element ? (element.getAttribute('content') || '').trim() : '';
  };

  return {
    url: location.href,
    title: document.title || '',
    globals,
    versions,
    markers,
    urls,
    generator: meta('generator'),
    htmlClass: (document.documentElement.getAttribute('class') || '').slice(0, 500),
    bodyClass: (document.body ? document.body.getAttribute('class') || '' : '').slice(0, 500),
    collectedAt: new Date().toISOString(),
  };
}
