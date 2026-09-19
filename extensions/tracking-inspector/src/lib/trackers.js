/**
 * Tracker detection.
 *
 * Pure functions: raw page signals in, named trackers out. No DOM, no chrome.*
 * APIs - which is what makes this file directly unit-testable under Node.
 */

export const CATEGORIES = Object.freeze([
  { id: 'consent', label: 'Consent management' },
  { id: 'tag-manager', label: 'Tag managers' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'advertising', label: 'Advertising' },
  { id: 'session', label: 'Session replay & heatmaps' },
  { id: 'support', label: 'Support & chat' },
  { id: 'monitoring', label: 'Error monitoring' },
]);

/**
 * The detection registry.
 *
 * `globals` and `cookies` are exact names; `hosts` are matched against the
 * hostname of each loaded script or iframe, so a substring cannot match an
 * unrelated domain that merely contains the string.
 */
export const TRACKERS = Object.freeze([
  // --- Consent ---
  { id: 'onetrust', name: 'OneTrust', category: 'consent', globals: ['OneTrust'], hosts: ['cdn.cookielaw.org', 'onetrust.com'], cookies: ['OptanonConsent', 'OptanonAlertBoxClosed'] },
  { id: 'cookiebot', name: 'Cookiebot', category: 'consent', globals: ['Cookiebot'], hosts: ['consent.cookiebot.com'], cookies: ['CookieConsent'] },
  { id: 'didomi', name: 'Didomi', category: 'consent', globals: ['Didomi'], hosts: ['sdk.privacy-center.org'], cookies: ['didomi_token', 'euconsent-v2'] },
  { id: 'axeptio', name: 'Axeptio', category: 'consent', globals: ['axeptioSDK'], hosts: ['static.axept.io'], cookies: ['axeptio_authorized_vendors'] },
  { id: 'usercentrics', name: 'Usercentrics', category: 'consent', globals: ['UC_UI'], hosts: ['app.usercentrics.eu'], cookies: [] },
  { id: 'osano', name: 'Osano', category: 'consent', globals: ['Osano'], hosts: ['cmp.osano.com'], cookies: [] },
  { id: 'trustarc', name: 'TrustArc', category: 'consent', globals: ['truste'], hosts: ['consent.trustarc.com'], cookies: [] },
  { id: 'klaro', name: 'Klaro', category: 'consent', globals: ['klaro'], hosts: [], cookies: ['klaro'] },

  // --- Tag managers ---
  { id: 'gtm', name: 'Google Tag Manager', category: 'tag-manager', globals: ['google_tag_manager'], hosts: ['googletagmanager.com'], cookies: [] },
  { id: 'tealium', name: 'Tealium', category: 'tag-manager', globals: ['utag'], hosts: ['tags.tiqcdn.com'], cookies: [] },
  { id: 'segment', name: 'Segment', category: 'tag-manager', globals: ['analytics'], hosts: ['cdn.segment.com'], cookies: ['ajs_anonymous_id'] },

  // --- Analytics ---
  { id: 'ga4', name: 'Google Analytics', category: 'analytics', globals: ['gtag', 'ga', 'GoogleAnalyticsObject'], hosts: ['google-analytics.com', 'analytics.google.com'], cookies: ['_ga', '_gid'] },
  { id: 'matomo', name: 'Matomo', category: 'analytics', globals: ['_paq', 'Matomo'], hosts: ['matomo.cloud'], cookies: ['_pk_id'] },
  { id: 'plausible', name: 'Plausible', category: 'analytics', globals: ['plausible'], hosts: ['plausible.io'], cookies: [] },
  { id: 'fathom', name: 'Fathom', category: 'analytics', globals: ['fathom'], hosts: ['cdn.usefathom.com'], cookies: [] },
  { id: 'umami', name: 'Umami', category: 'analytics', globals: ['umami'], hosts: ['umami.is'], cookies: [] },
  { id: 'mixpanel', name: 'Mixpanel', category: 'analytics', globals: ['mixpanel'], hosts: ['cdn.mxpnl.com'], cookies: [] },
  { id: 'amplitude', name: 'Amplitude', category: 'analytics', globals: ['amplitude'], hosts: ['cdn.amplitude.com'], cookies: [] },
  { id: 'posthog', name: 'PostHog', category: 'analytics', globals: ['posthog'], hosts: ['posthog.com'], cookies: [] },
  { id: 'heap', name: 'Heap', category: 'analytics', globals: ['heap'], hosts: ['cdn.heapanalytics.com'], cookies: [] },
  { id: 'hubspot', name: 'HubSpot', category: 'analytics', globals: ['_hsq'], hosts: ['js.hs-scripts.com', 'js.hsadspixel.net'], cookies: ['hubspotutk'] },

  // --- Advertising ---
  { id: 'meta', name: 'Meta Pixel', category: 'advertising', globals: ['fbq', '_fbq'], hosts: ['connect.facebook.net'], cookies: ['_fbp'] },
  { id: 'google-ads', name: 'Google Ads', category: 'advertising', globals: [], hosts: ['googleadservices.com', 'googlesyndication.com', 'doubleclick.net'], cookies: ['_gcl_au'] },
  { id: 'tiktok', name: 'TikTok Pixel', category: 'advertising', globals: ['ttq'], hosts: ['analytics.tiktok.com'], cookies: [] },
  { id: 'x-ads', name: 'X (Twitter) Pixel', category: 'advertising', globals: ['twq'], hosts: ['static.ads-twitter.com'], cookies: [] },
  { id: 'snapchat', name: 'Snap Pixel', category: 'advertising', globals: ['snaptr'], hosts: ['sc-static.net'], cookies: [] },
  { id: 'pinterest', name: 'Pinterest Tag', category: 'advertising', globals: ['pintrk'], hosts: ['s.pinimg.com'], cookies: [] },
  { id: 'linkedin', name: 'LinkedIn Insight', category: 'advertising', globals: ['lintrk'], hosts: ['snap.licdn.com'], cookies: [] },
  { id: 'bing', name: 'Microsoft Ads (UET)', category: 'advertising', globals: ['uetq'], hosts: ['bat.bing.com'], cookies: [] },
  { id: 'reddit', name: 'Reddit Pixel', category: 'advertising', globals: ['rdt'], hosts: ['redditstatic.com'], cookies: [] },
  { id: 'criteo', name: 'Criteo', category: 'advertising', globals: [], hosts: ['static.criteo.net'], cookies: [] },

  // --- Session replay ---
  { id: 'hotjar', name: 'Hotjar', category: 'session', globals: ['hj', 'hjSiteSettings'], hosts: ['static.hotjar.com', 'script.hotjar.com'], cookies: ['_hjSessionUser'] },
  { id: 'clarity', name: 'Microsoft Clarity', category: 'session', globals: ['clarity'], hosts: ['clarity.ms'], cookies: ['_clck'] },
  { id: 'logrocket', name: 'LogRocket', category: 'session', globals: ['LogRocket'], hosts: ['cdn.logrocket.io'], cookies: [] },
  { id: 'fullstory', name: 'FullStory', category: 'session', globals: ['FS'], hosts: ['edge.fullstory.com'], cookies: [] },
  { id: 'smartlook', name: 'Smartlook', category: 'session', globals: ['smartlook'], hosts: ['web-sdk.smartlook.com'], cookies: [] },

  // --- Support ---
  { id: 'intercom', name: 'Intercom', category: 'support', globals: ['Intercom'], hosts: ['widget.intercom.io'], cookies: [] },
  { id: 'zendesk', name: 'Zendesk', category: 'support', globals: ['zE'], hosts: ['static.zdassets.com'], cookies: [] },
  { id: 'drift', name: 'Drift', category: 'support', globals: ['drift'], hosts: ['js.driftt.com'], cookies: [] },

  // --- Monitoring ---
  { id: 'sentry', name: 'Sentry', category: 'monitoring', globals: ['Sentry'], hosts: ['browser.sentry-cdn.com'], cookies: [] },
  { id: 'newrelic', name: 'New Relic', category: 'monitoring', globals: ['newrelic'], hosts: ['js-agent.newrelic.com'], cookies: [] },
  { id: 'datadog', name: 'Datadog RUM', category: 'monitoring', globals: ['DD_RUM'], hosts: ['datadoghq-browser-agent.com'], cookies: [] },
]);

/** Tag identifiers worth surfacing, and how to recognise them. */
const ID_PATTERNS = Object.freeze([
  { label: 'GTM container', pattern: /\bGTM-[A-Z0-9]{4,10}\b/g },
  { label: 'GA4 measurement', pattern: /\bG-[A-Z0-9]{6,12}\b/g },
  { label: 'Universal Analytics', pattern: /\bUA-\d{4,10}-\d{1,4}\b/g },
  { label: 'Google Ads', pattern: /\bAW-\d{6,14}\b/g },
  { label: 'Floodlight', pattern: /\bDC-\d{6,14}\b/g },
  { label: 'Meta Pixel', pattern: /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{6,20})['"]/g },
  { label: 'Hotjar site', pattern: /hjid\s*[:=]\s*(\d{4,12})/g },
  { label: 'Clarity project', pattern: /clarity\.ms\/tag\/([a-z0-9]{6,15})/g },
]);

/** Extracts the hostname of a URL, or '' if it has none. */
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** True when host is the domain itself or a subdomain of it - never a lookalike. */
function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

/**
 * Finds tag identifiers in the page's scripts and inline snippets.
 *
 * @param {object} signals Output of collectSignals().
 * @returns {Array<{label: string, value: string}>} Deduplicated.
 */
export function extractIds(signals) {
  if (!signals || typeof signals !== 'object') return [];

  const haystack = [
    ...(Array.isArray(signals.scripts) ? signals.scripts : []),
    ...(Array.isArray(signals.gtmContainers) ? signals.gtmContainers : []),
    String(signals.inline || ''),
  ].join('\n');

  const found = [];
  const seen = new Set();

  for (const { label, pattern } of ID_PATTERNS) {
    // A fresh regex per run: /g patterns carry lastIndex between calls.
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(haystack)) !== null) {
      const value = match[1] || match[0];
      const key = label + '|' + value;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ label, value });
      if (found.length >= 60) return found;
    }
  }

  return found;
}

/**
 * Identifies the trackers present, with the evidence for each.
 *
 * @param {object} signals Output of collectSignals().
 * @returns {Array<{id, name, category, evidence: Array<string>}>}
 * @throws {TypeError} If signals is not an object.
 */
export function detectTrackers(signals) {
  if (!signals || typeof signals !== 'object') {
    throw new TypeError('detectTrackers() requires collected signals.');
  }

  const globals = new Set(Array.isArray(signals.globals) ? signals.globals : []);
  const cookies = new Set(Array.isArray(signals.cookieNames) ? signals.cookieNames : []);
  const hosts = [
    ...(Array.isArray(signals.scripts) ? signals.scripts : []),
    ...(Array.isArray(signals.iframes) ? signals.iframes : []),
  ]
    .map(hostOf)
    .filter(Boolean);

  const detected = [];

  for (const tracker of TRACKERS) {
    const evidence = [];

    for (const name of tracker.globals || []) {
      if (globals.has(name)) evidence.push('window.' + name);
    }

    for (const domain of tracker.hosts || []) {
      if (hosts.some((host) => hostMatches(host, domain))) evidence.push(domain);
    }

    for (const cookie of tracker.cookies || []) {
      // Cookie names are often suffixed, e.g. _ga_XXXX or _pk_id.1.abcd.
      if ([...cookies].some((name) => name === cookie || name.startsWith(cookie))) {
        evidence.push('cookie ' + cookie);
      }
    }

    if (evidence.length) {
      detected.push({
        id: tracker.id,
        name: tracker.name,
        category: tracker.category,
        evidence,
      });
    }
  }

  return detected;
}

/**
 * Rolls detections up, and decides the page-level verdict.
 *
 * A page that loads advertising or session-replay trackers without any consent
 * management platform is flagged, because in the EU that is usually a problem.
 *
 * @param {Array} detected Output of detectTrackers().
 * @returns {object}
 */
export function summarize(detected) {
  const summary = {
    total: 0,
    byCategory: {},
    hasConsent: false,
    needsConsent: false,
    status: 'ok',
  };
  if (!Array.isArray(detected)) return summary;

  for (const tracker of detected) {
    summary.total++;
    summary.byCategory[tracker.category] = (summary.byCategory[tracker.category] || 0) + 1;
    if (tracker.category === 'consent') summary.hasConsent = true;
    if (tracker.category === 'advertising' || tracker.category === 'session') {
      summary.needsConsent = true;
    }
  }

  if (summary.needsConsent && !summary.hasConsent) summary.status = 'warning';
  else if (summary.total > 0) summary.status = 'info';

  return summary;
}

/** Groups detections for rendering, preserving CATEGORIES order. */
export function groupByCategory(detected) {
  if (!Array.isArray(detected)) return [];

  return CATEGORIES.map((category) => ({
    ...category,
    trackers: detected.filter((tracker) => tracker.category === category.id),
  })).filter((group) => group.trackers.length);
}

export const CSV_HEADER = Object.freeze(['tracker', 'category', 'evidence']);

/** Shapes detections into CSV rows, header included. */
export function toRows(detected) {
  if (!Array.isArray(detected)) throw new TypeError('toRows() requires an array.');

  return [
    [...CSV_HEADER],
    ...detected.map((tracker) => [tracker.name, tracker.category, tracker.evidence.join(' | ')]),
  ];
}
