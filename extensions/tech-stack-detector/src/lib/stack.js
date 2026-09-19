/**
 * Technology detection.
 *
 * Pure functions: raw page signals in, named technologies out. No DOM, no
 * chrome.* APIs - which is what makes this file directly unit-testable.
 */

export const CATEGORIES = Object.freeze([
  { id: 'framework', label: 'JavaScript frameworks' },
  { id: 'meta-framework', label: 'Meta frameworks' },
  { id: 'cms', label: 'CMS & site builders' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'ui', label: 'UI & CSS' },
  { id: 'library', label: 'Libraries' },
  { id: 'tooling', label: 'Build tooling' },
]);

/**
 * Detection registry.
 *
 * - `globals`   exact window property names
 * - `markers`   ids emitted by the collector's DOM probes
 * - `paths`     case-insensitive substrings of a loaded script or stylesheet URL
 * - `generator` matched against the <meta name="generator"> content
 * - `classes`   substrings of the html/body class attributes
 * - `version`   key of signals.versions to display
 */
export const TECHNOLOGIES = Object.freeze([
  // --- Frameworks ---
  { id: 'react', name: 'React', category: 'framework', globals: ['React', '__REACT_DEVTOOLS_GLOBAL_HOOK__'], markers: ['data-reactroot'], version: 'react' },
  { id: 'vue', name: 'Vue', category: 'framework', globals: ['Vue', '__VUE__', '__VUE_DEVTOOLS_GLOBAL_HOOK__'], markers: ['vue-app'], version: 'vue' },
  { id: 'angular', name: 'Angular', category: 'framework', globals: ['getAllAngularRootElements'], markers: ['ng-version'], version: 'angular' },
  { id: 'angularjs', name: 'AngularJS', category: 'framework', globals: ['angular'], markers: ['angularjs'], version: 'angularjs' },
  { id: 'svelte', name: 'Svelte', category: 'framework', globals: ['__svelte'], markers: ['svelte'] },
  { id: 'ember', name: 'Ember', category: 'framework', globals: ['Ember'] },
  { id: 'backbone', name: 'Backbone', category: 'framework', globals: ['Backbone'] },
  { id: 'alpine', name: 'Alpine.js', category: 'framework', globals: ['Alpine'], markers: ['alpine'], version: 'alpine' },
  { id: 'htmx', name: 'htmx', category: 'framework', globals: ['htmx'], markers: ['htmx'] },
  { id: 'stimulus', name: 'Stimulus', category: 'framework', globals: ['Stimulus'], markers: ['stimulus'] },
  { id: 'livewire', name: 'Livewire', category: 'framework', globals: ['Livewire'], markers: ['livewire'] },

  // --- Meta frameworks ---
  { id: 'next', name: 'Next.js', category: 'meta-framework', globals: ['__NEXT_DATA__'], markers: ['next-root'], paths: ['/_next/'] },
  { id: 'nuxt', name: 'Nuxt', category: 'meta-framework', globals: ['__NUXT__', '$nuxt'], markers: ['nuxt-root'], paths: ['/_nuxt/'] },
  { id: 'sveltekit', name: 'SvelteKit', category: 'meta-framework', globals: ['__sveltekit'], paths: ['/_app/immutable/'] },
  { id: 'remix', name: 'Remix', category: 'meta-framework', globals: ['__remixContext'] },
  { id: 'astro', name: 'Astro', category: 'meta-framework', globals: ['astro', '__astro'], markers: ['astro'], generator: /astro/i },
  { id: 'turbo', name: 'Hotwire Turbo', category: 'meta-framework', globals: ['Turbo'], markers: ['turbo'] },
  { id: 'blazor', name: 'Blazor', category: 'meta-framework', globals: ['Blazor'] },

  // --- CMS ---
  { id: 'wordpress', name: 'WordPress', category: 'cms', globals: ['wp'], paths: ['/wp-content/', '/wp-includes/'], generator: /wordpress/i },
  { id: 'elementor', name: 'Elementor', category: 'cms', globals: ['elementorFrontend'], markers: ['elementor'], paths: ['/elementor/'] },
  { id: 'drupal', name: 'Drupal', category: 'cms', globals: ['Drupal'], paths: ['/sites/default/files/'], generator: /drupal/i },
  { id: 'joomla', name: 'Joomla', category: 'cms', paths: ['/media/jui/'], generator: /joomla/i },
  { id: 'ghost', name: 'Ghost', category: 'cms', paths: ['/assets/built/'], generator: /ghost/i },
  { id: 'webflow', name: 'Webflow', category: 'cms', globals: ['Webflow'], paths: ['assets.website-files.com', 'uploads-ssl.webflow.com'], generator: /webflow/i },
  { id: 'squarespace', name: 'Squarespace', category: 'cms', globals: ['Squarespace'], paths: ['static1.squarespace.com'] },
  { id: 'wix', name: 'Wix', category: 'cms', globals: ['wixPerformanceMeasurements'], paths: ['static.parastorage.com'], generator: /wix\.com/i },
  { id: 'hubspot-cms', name: 'HubSpot CMS', category: 'cms', paths: ['hs-sites.com', 'hubspotusercontent'], generator: /hubspot/i },

  // --- E-commerce ---
  { id: 'shopify', name: 'Shopify', category: 'ecommerce', globals: ['Shopify'], paths: ['cdn.shopify.com', 'cdn.shopifycloud.com'] },
  { id: 'woocommerce', name: 'WooCommerce', category: 'ecommerce', globals: ['woocommerce_params'], markers: ['woocommerce'], paths: ['/woocommerce/'], generator: /woocommerce/i },
  { id: 'prestashop', name: 'PrestaShop', category: 'ecommerce', globals: ['PrestaShop'], generator: /prestashop/i },
  { id: 'magento', name: 'Magento', category: 'ecommerce', globals: ['Magento'], paths: ['/static/version', '/mage/'] },
  { id: 'bigcommerce', name: 'BigCommerce', category: 'ecommerce', paths: ['cdn11.bigcommerce.com'] },

  // --- UI ---
  { id: 'bootstrap', name: 'Bootstrap', category: 'ui', globals: ['bootstrap'], markers: ['bootstrap'], paths: ['bootstrap.min.css', 'bootstrap.bundle'] },
  { id: 'tailwind', name: 'Tailwind CSS', category: 'ui', markers: ['tailwind'], paths: ['cdn.tailwindcss.com'] },
  { id: 'fontawesome', name: 'Font Awesome', category: 'ui', paths: ['font-awesome', 'fontawesome'] },
  { id: 'google-fonts', name: 'Google Fonts', category: 'ui', paths: ['fonts.googleapis.com', 'fonts.gstatic.com'] },
  { id: 'swiper', name: 'Swiper', category: 'ui', globals: ['Swiper'], paths: ['swiper'] },
  { id: 'aos', name: 'AOS', category: 'ui', globals: ['AOS'] },

  // --- Libraries ---
  { id: 'jquery', name: 'jQuery', category: 'library', globals: ['jQuery'], paths: ['jquery'], version: 'jquery' },
  { id: 'lodash', name: 'Lodash / Underscore', category: 'library', globals: ['_'], paths: ['lodash', 'underscore'] },
  { id: 'axios', name: 'Axios', category: 'library', globals: ['axios'], paths: ['axios'] },
  { id: 'moment', name: 'Moment.js', category: 'library', globals: ['moment'], paths: ['moment'], version: 'moment' },
  { id: 'dayjs', name: 'Day.js', category: 'library', globals: ['dayjs'], paths: ['dayjs'] },
  { id: 'gsap', name: 'GSAP', category: 'library', globals: ['gsap'], paths: ['gsap'] },
  { id: 'three', name: 'Three.js', category: 'library', globals: ['THREE'], paths: ['three.min.js'] },
  { id: 'd3', name: 'D3', category: 'library', globals: ['d3'], paths: ['d3.min.js'], version: 'd3' },
  { id: 'lottie', name: 'Lottie', category: 'library', globals: ['Lottie', 'lottie'], paths: ['lottie'] },

  // --- Tooling ---
  { id: 'webpack', name: 'webpack', category: 'tooling', globals: ['webpackChunk', '__webpack_require__'] },
  { id: 'vite', name: 'Vite', category: 'tooling', globals: ['__vite__'], paths: ['/@vite/', '/assets/index-'] },
  { id: 'cloudflare', name: 'Cloudflare', category: 'tooling', paths: ['cdnjs.cloudflare.com', '/cdn-cgi/'] },
  { id: 'jsdelivr', name: 'jsDelivr', category: 'tooling', paths: ['cdn.jsdelivr.net'] },
]);

/**
 * Identifies the technologies present, with the evidence for each.
 *
 * @param {object} signals Output of collectSignals().
 * @returns {Array<{id, name, category, version: string, evidence: Array<string>}>}
 * @throws {TypeError} If signals is not an object.
 */
export function detectStack(signals) {
  if (!signals || typeof signals !== 'object') {
    throw new TypeError('detectStack() requires collected signals.');
  }

  const globals = new Set(Array.isArray(signals.globals) ? signals.globals : []);
  const markers = new Set(Array.isArray(signals.markers) ? signals.markers : []);
  const urls = (Array.isArray(signals.urls) ? signals.urls : []).map((url) =>
    String(url).toLowerCase()
  );
  const generator = String(signals.generator || '');
  const classes = (String(signals.htmlClass || '') + ' ' + String(signals.bodyClass || '')).toLowerCase();
  const versions = signals.versions && typeof signals.versions === 'object' ? signals.versions : {};

  const detected = [];

  for (const technology of TECHNOLOGIES) {
    const evidence = [];

    for (const name of technology.globals || []) {
      if (globals.has(name)) evidence.push('window.' + name);
    }
    for (const marker of technology.markers || []) {
      if (markers.has(marker)) evidence.push('DOM: ' + marker);
    }
    for (const path of technology.paths || []) {
      if (urls.some((url) => url.includes(path.toLowerCase()))) evidence.push(path);
    }
    for (const name of technology.classes || []) {
      if (classes.includes(name.toLowerCase())) evidence.push('class ' + name);
    }
    if (technology.generator && generator && technology.generator.test(generator)) {
      evidence.push('generator: ' + generator);
    }

    if (!evidence.length) continue;

    detected.push({
      id: technology.id,
      name: technology.name,
      category: technology.category,
      version: technology.version ? String(versions[technology.version] || '') : '',
      evidence,
      confidence: evidence.length > 1 ? 'high' : 'low',
    });
  }

  return resolveConflicts(detected);
}

/**
 * Removes detections that a more specific one makes wrong.
 *
 * `window.$` and `window._` are shared by several libraries, and a meta
 * framework implies its underlying framework rather than competing with it -
 * but AngularJS and Angular really are different products, and reporting both
 * because `window.angular` exists would be misleading.
 */
function resolveConflicts(detected) {
  const byId = new Map(detected.map((item) => [item.id, item]));

  // Angular 2+ and AngularJS are mutually exclusive. Modern Angular apps can
  // still expose window.angular, which is AngularJS's only signal, so a
  // signal unique to modern Angular has to break the tie.
  if (byId.has('angular') && byId.has('angularjs')) {
    const modern = byId.get('angular');
    const certain = modern.evidence.some(
      (item) => item === 'DOM: ng-version' || item === 'window.getAllAngularRootElements'
    );
    if (certain) byId.delete('angularjs');
  }

  return [...byId.values()];
}

/** Counts detections per category. */
export function summarize(detected) {
  const summary = { total: 0, byCategory: {}, confident: 0 };
  if (!Array.isArray(detected)) return summary;

  for (const item of detected) {
    summary.total++;
    summary.byCategory[item.category] = (summary.byCategory[item.category] || 0) + 1;
    if (item.confidence === 'high') summary.confident++;
  }

  return summary;
}

/** Groups detections for rendering, preserving CATEGORIES order. */
export function groupByCategory(detected) {
  if (!Array.isArray(detected)) return [];

  return CATEGORIES.map((category) => ({
    ...category,
    items: detected.filter((item) => item.category === category.id),
  })).filter((group) => group.items.length);
}

export const CSV_HEADER = Object.freeze(['technology', 'category', 'version', 'confidence', 'evidence']);

/** Shapes detections into CSV rows, header included. */
export function toRows(detected) {
  if (!Array.isArray(detected)) throw new TypeError('toRows() requires an array.');

  return [
    [...CSV_HEADER],
    ...detected.map((item) => [
      item.name,
      item.category,
      item.version,
      item.confidence,
      item.evidence.join(' | '),
    ]),
  ];
}
