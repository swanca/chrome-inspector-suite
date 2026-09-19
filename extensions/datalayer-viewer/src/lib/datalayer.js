/**
 * dataLayer analysis.
 *
 * Pure functions: sanitised entries in, structure out. No DOM, no chrome.*
 * APIs - which is what makes this file directly unit-testable under Node.
 */

/**
 * The event name of one dataLayer entry.
 *
 * Two shapes exist side by side in the wild:
 *   - GTM objects:  { event: 'purchase', ecommerce: {...} }
 *   - gtag arrays:  ['event', 'purchase', {...}] or ['config', 'G-XXX']
 *
 * @param {*} entry
 * @returns {string|null}
 */
export function eventNameOf(entry) {
  if (!entry || typeof entry !== 'object') return null;

  if (Array.isArray(entry)) {
    const command = typeof entry[0] === 'string' ? entry[0] : null;
    if (!command) return null;
    if (command === 'event' && typeof entry[1] === 'string') return entry[1];
    return command;
  }

  return typeof entry.event === 'string' && entry.event ? entry.event : null;
}

/** A short, human description of what an entry is. */
export function describeEntry(entry) {
  const name = eventNameOf(entry);
  if (name) return name;

  if (Array.isArray(entry)) return 'array(' + entry.length + ')';
  if (entry && typeof entry === 'object') {
    const keys = Object.keys(entry);
    if (!keys.length) return 'empty object';
    return keys.slice(0, 3).join(', ') + (keys.length > 3 ? ', …' : '');
  }
  return String(entry);
}

/**
 * Annotates entries with their index, event name and description.
 *
 * @param {Array} entries
 * @returns {Array<{index: number, event: string|null, label: string, value: *}>}
 * @throws {TypeError} If entries is not an array.
 */
export function annotate(entries) {
  if (!Array.isArray(entries)) throw new TypeError('annotate() requires an array of entries.');

  return entries.map((value, index) => ({
    index,
    event: eventNameOf(value),
    label: describeEntry(value),
    value,
  }));
}

/**
 * Counts entries and events.
 *
 * @param {Array} annotated Output of annotate().
 * @returns {{total: number, events: number, unnamed: number, counts: Array<[string, number]>}}
 */
export function summarize(annotated) {
  const summary = { total: 0, events: 0, unnamed: 0, counts: [] };
  if (!Array.isArray(annotated)) return summary;

  const counts = new Map();

  for (const entry of annotated) {
    summary.total++;
    if (entry.event) {
      summary.events++;
      counts.set(entry.event, (counts.get(entry.event) || 0) + 1);
    } else {
      summary.unnamed++;
    }
  }

  // Most frequent first, then alphabetically so the order is stable.
  summary.counts = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  return summary;
}

/**
 * Every "path = value" pair inside an entry, used for searching.
 *
 * @param {*} value
 * @param {string} [prefix]
 * @param {number} [depth]
 * @returns {Array<{path: string, value: string}>}
 */
export function flatten(value, prefix = '', depth = 0) {
  if (depth > 12) return [{ path: prefix, value: '[Depth limit]' }];

  if (value === null || typeof value !== 'object') {
    return [{ path: prefix, value: String(value) }];
  }

  const out = [];

  if (Array.isArray(value)) {
    if (!value.length) return [{ path: prefix, value: '[]' }];
    value.forEach((item, index) => {
      out.push(...flatten(item, prefix ? prefix + '[' + index + ']' : String(index), depth + 1));
    });
    return out;
  }

  const keys = Object.keys(value);
  if (!keys.length) return [{ path: prefix, value: '{}' }];

  for (const key of keys) {
    out.push(...flatten(value[key], prefix ? prefix + '.' + key : key, depth + 1));
  }
  return out;
}

/**
 * Case-insensitive search across an entry's event name, keys and values.
 *
 * @param {object} annotatedEntry One item from annotate().
 * @param {string} query
 * @returns {boolean}
 */
export function matches(annotatedEntry, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  if (!annotatedEntry) return false;

  if (annotatedEntry.event && annotatedEntry.event.toLowerCase().includes(needle)) return true;

  return flatten(annotatedEntry.value).some(
    (pair) =>
      pair.path.toLowerCase().includes(needle) || pair.value.toLowerCase().includes(needle)
  );
}

/**
 * Filters annotated entries by search text and event name.
 *
 * @param {Array} annotated
 * @param {object} [options]
 * @param {string} [options.query]
 * @param {string} [options.event] Exact event name, or '' for all.
 * @returns {Array}
 */
export function filterEntries(annotated, options = {}) {
  if (!Array.isArray(annotated)) throw new TypeError('filterEntries() requires an array.');

  let result = annotated;
  if (options.event) result = result.filter((entry) => entry.event === options.event);
  if (options.query) result = result.filter((entry) => matches(entry, options.query));
  return result;
}

/** Pretty-printed JSON of the whole capture, for the export button. */
export function toJson(data) {
  if (!data || typeof data !== 'object') throw new TypeError('toJson() requires the capture.');

  return JSON.stringify(
    {
      tool: 'DataLayer Viewer',
      version: 1,
      url: data.url || null,
      capturedAt: data.collectedAt || new Date().toISOString(),
      containers: data.containers || [],
      layers: data.layers || [],
    },
    null,
    2
  );
}
