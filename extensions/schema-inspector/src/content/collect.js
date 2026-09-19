/**
 * Structured data collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript(). It must therefore
 * be entirely self-contained: no imports, no references to module scope.
 *
 * It parses JSON-LD and walks Microdata, but validates nothing. The rules live
 * in src/lib/schema.js, where they can be tested.
 *
 * @returns {object}
 */
export function collectSchema() {
  const MAX_BLOCKS = 50;
  const MAX_DEPTH = 10;
  const MAX_ITEMS = 200;
  const MAX_TEXT = 500;

  const clip = (value) => {
    const trimmed = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) + '…' : trimmed;
  };

  const absolute = (href) => {
    if (!href) return '';
    try {
      return new URL(href, document.baseURI).href;
    } catch {
      return String(href);
    }
  };

  // --- JSON-LD ---------------------------------------------------------------

  const jsonLd = [];

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    if (jsonLd.length >= MAX_BLOCKS) break;

    const raw = script.textContent || '';
    try {
      jsonLd.push({ ok: true, data: JSON.parse(raw) });
    } catch (error) {
      jsonLd.push({
        ok: false,
        error: error && error.message ? error.message : 'Invalid JSON',
        // Enough of the source to find the block, never the whole payload.
        excerpt: clip(raw).slice(0, 200),
      });
    }
  }

  // --- Microdata -------------------------------------------------------------

  /** The value a Microdata property carries depends on the element it is on. */
  function propertyValue(element) {
    const tag = element.tagName;

    if (element.hasAttribute('itemscope')) return null; // Handled as a nested item.
    if (tag === 'META') return clip(element.getAttribute('content'));
    if (tag === 'A' || tag === 'AREA' || tag === 'LINK') {
      return absolute(element.getAttribute('href'));
    }
    if (['IMG', 'AUDIO', 'EMBED', 'IFRAME', 'SOURCE', 'TRACK', 'VIDEO'].includes(tag)) {
      return absolute(element.getAttribute('src'));
    }
    if (tag === 'OBJECT') return absolute(element.getAttribute('data'));
    if (tag === 'DATA' || tag === 'METER') return clip(element.getAttribute('value'));
    if (tag === 'TIME') return clip(element.getAttribute('datetime') || element.textContent);

    return clip(element.textContent);
  }

  /** Direct itemprop descendants of a scope, stopping at nested scopes. */
  function propertiesOf(scope) {
    const found = [];

    const walk = (node) => {
      for (const child of node.children) {
        if (child.hasAttribute('itemprop')) {
          found.push(child);
          // A nested scope owns its own properties; do not descend past it.
          if (child.hasAttribute('itemscope')) continue;
        }
        walk(child);
      }
    };

    walk(scope);
    return found;
  }

  function readItem(scope, depth) {
    const item = {
      type: clip(scope.getAttribute('itemtype')),
      id: clip(scope.getAttribute('itemid')),
      properties: {},
    };

    if (depth >= MAX_DEPTH) return item;

    for (const element of propertiesOf(scope)) {
      const names = clip(element.getAttribute('itemprop')).split(/\s+/).filter(Boolean);
      const value = element.hasAttribute('itemscope')
        ? readItem(element, depth + 1)
        : propertyValue(element);

      for (const name of names) {
        if (item.properties[name] === undefined) item.properties[name] = value;
        else if (Array.isArray(item.properties[name])) item.properties[name].push(value);
        else item.properties[name] = [item.properties[name], value];
      }
    }

    return item;
  }

  const microdata = [];
  for (const scope of document.querySelectorAll('[itemscope][itemtype]')) {
    if (microdata.length >= MAX_ITEMS) break;
    // Only top-level scopes; nested ones are read by their parent.
    if (scope.parentElement && scope.parentElement.closest('[itemscope]')) continue;
    microdata.push(readItem(scope, 0));
  }

  return {
    url: location.href,
    title: document.title || '',
    jsonLd,
    microdata,
    collectedAt: new Date().toISOString(),
  };
}
