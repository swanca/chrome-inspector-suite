/**
 * dataLayer collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript() with world: 'MAIN'.
 * The MAIN world is required: window.dataLayer belongs to the page, and is
 * invisible from the isolated world a content script normally runs in.
 *
 * It must therefore be entirely self-contained: no imports, no references to
 * module scope, and nothing that only exists in the extension.
 *
 * The sanitiser below cannot live in src/lib/ and be imported, for the same
 * reason. It is kept small and defensive instead: real dataLayers contain
 * functions, DOM nodes and circular references, all of which would make
 * executeScript's structured clone throw and the popup show nothing.
 *
 * @returns {object}
 */
export function collectDataLayer() {
  const MAX_DEPTH = 12;
  const MAX_KEYS = 200;
  const MAX_ITEMS = 500;
  const MAX_STRING = 2000;
  const MAX_ENTRIES = 500;

  /**
   * Converts an arbitrary page value into something structured-cloneable.
   * Cycles become "[Circular]" rather than hanging the collector.
   */
  function safeClone(value, depth, seen) {
    if (value === null || value === undefined) return null;

    const type = typeof value;

    if (type === 'string') {
      return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value;
    }
    if (type === 'number') return Number.isFinite(value) ? value : String(value);
    if (type === 'boolean') return value;
    if (type === 'bigint') return String(value) + 'n';
    if (type === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
    if (type === 'symbol') return String(value);
    if (type !== 'object') return String(value);

    if (depth >= MAX_DEPTH) return '[Depth limit]';
    if (seen.has(value)) return '[Circular]';

    // DOM nodes and other host objects are described, never walked.
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return '[' + (value.nodeName || 'Node') + ']';
    }
    if (typeof Window !== 'undefined' && value instanceof Window) return '[Window]';
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return String(value);
    if (value instanceof Error) return value.name + ': ' + value.message;

    seen.add(value);
    try {
      if (Array.isArray(value)) {
        const out = [];
        for (let i = 0; i < value.length && i < MAX_ITEMS; i++) {
          out.push(safeClone(value[i], depth + 1, seen));
        }
        if (value.length > MAX_ITEMS) out.push('[' + (value.length - MAX_ITEMS) + ' more]');
        return out;
      }

      if (value instanceof Map) {
        const out = {};
        let count = 0;
        for (const [key, item] of value) {
          if (count++ >= MAX_KEYS) break;
          out[String(key)] = safeClone(item, depth + 1, seen);
        }
        return out;
      }

      if (value instanceof Set) {
        return safeClone([...value].slice(0, MAX_ITEMS), depth + 1, seen);
      }

      const out = {};
      let count = 0;
      for (const key of Object.keys(value)) {
        if (count++ >= MAX_KEYS) break;
        try {
          out[key] = safeClone(value[key], depth + 1, seen);
        } catch (error) {
          // Accessor properties can throw; that must not lose the whole object.
          out[key] = '[Threw: ' + (error && error.message ? error.message : 'error') + ']';
        }
      }
      return out;
    } finally {
      seen.delete(value);
    }
  }

  const read = (name) => {
    try {
      const value = window[name];
      if (!Array.isArray(value)) return null;
      const slice = value.slice(0, MAX_ENTRIES);
      return {
        name,
        total: value.length,
        truncated: value.length > MAX_ENTRIES,
        entries: slice.map((entry) => safeClone(entry, 0, new WeakSet())),
      };
    } catch {
      return null;
    }
  };

  // The conventional names, in the order they are worth reporting.
  const layers = [];
  for (const name of ['dataLayer', 'digitalData', 'utag_data', 'dataLayerGA4', '_mtm']) {
    const layer = read(name);
    if (layer) layers.push(layer);
  }

  // Any other array on window that looks like a tag-manager queue.
  try {
    for (const key of Object.keys(window)) {
      if (layers.some((layer) => layer.name === key)) continue;
      if (!/datalayer/i.test(key)) continue;
      const layer = read(key);
      if (layer) layers.push(layer);
      if (layers.length >= 8) break;
    }
  } catch {
    // Enumerating window can throw on hardened pages; the known names suffice.
  }

  let containers = [];
  try {
    if (window.google_tag_manager) {
      containers = Object.keys(window.google_tag_manager).filter((key) => /^GTM-/.test(key));
    }
  } catch {
    containers = [];
  }

  return {
    url: location.href,
    title: document.title || '',
    layers,
    containers,
    hasGtag: typeof window.gtag === 'function',
    collectedAt: new Date().toISOString(),
  };
}
