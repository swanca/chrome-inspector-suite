/**
 * GENERATED FILE - do not edit.
 * Source: shared/page.js
 * Run `npm run sync` after changing the source.
 *
 * Tab access, shared by every extension in this repository.
 *
 * `describeBlockedUrl` is pure and unit-tested; the two async helpers are thin
 * wrappers over the chrome.* APIs and are exercised by loading the extension.
 */

/** URL schemes Chrome never allows an extension to script. */
export const BLOCKED_SCHEMES = Object.freeze([
  'chrome:',
  'chrome-extension:',
  'devtools:',
  'edge:',
  'about:',
  'view-source:',
  'data:',
]);

/** Chrome's own web properties are additionally off-limits. */
export const BLOCKED_HOSTS = Object.freeze([
  'chrome.google.com',
  'chromewebstore.google.com',
]);

/**
 * Explains why a URL cannot be inspected, or returns null if it can.
 *
 * @param {string|undefined} url
 * @returns {{message: string, hint: string}|null}
 */
export function describeBlockedUrl(url) {
  if (!url) {
    return {
      message: 'No page to inspect.',
      hint: 'Open a website in this tab, then reopen the extension.',
    };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      message: 'This tab has no readable address.',
      hint: 'Try a normal web page.',
    };
  }

  if (parsed.protocol === 'file:') {
    return {
      message: 'Local files are blocked by default.',
      hint: 'Enable "Allow access to file URLs" for this extension on chrome://extensions.',
    };
  }

  if (BLOCKED_SCHEMES.includes(parsed.protocol)) {
    return {
      message: 'Chrome does not allow extensions on this page.',
      hint: 'Browser pages such as ' + parsed.protocol + '// are off-limits.',
    };
  }

  if (BLOCKED_HOSTS.includes(parsed.hostname)) {
    return {
      message: 'Chrome does not allow extensions on the Web Store.',
      hint: 'Open any other website and try again.',
    };
  }

  return null;
}

/**
 * Reads the active tab.
 * @returns {Promise<chrome.tabs.Tab>}
 * @throws {Error} With a message fit for display.
 */
export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== 'number') {
    throw new Error('Could not identify the active tab.');
  }
  return tab;
}

/**
 * Runs a self-contained function inside the page and returns its value.
 *
 * The function is serialised with Function.prototype.toString(), so it must not
 * reference anything outside its own body.
 *
 * @param {number}   tabId
 * @param {Function} func         Self-contained collector.
 * @param {object}   [options]
 * @param {'ISOLATED'|'MAIN'} [options.world]
 *        Use 'MAIN' to read page variables such as window.dataLayer, which are
 *        invisible from the default isolated world.
 * @param {Array}    [options.args] Structured-cloneable arguments.
 * @returns {Promise<*>} Whatever the function returned.
 * @throws {Error} With a message fit for display.
 */
export async function runInPage(tabId, func, options = {}) {
  const injection = { target: { tabId }, func };
  if (options.world) injection.world = options.world;
  if (options.args) injection.args = options.args;

  const results = await chrome.scripting.executeScript(injection);
  const first = Array.isArray(results) ? results[0] : null;

  if (!first) throw new Error('The page returned nothing.');
  if (first.error) throw new Error(String(first.error));
  if (first.result === undefined || first.result === null) {
    throw new Error('The page returned no data.');
  }

  return first.result;
}
