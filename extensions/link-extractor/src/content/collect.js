/**
 * Link collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript(). It must therefore
 * be entirely self-contained: no imports, no references to module scope.
 *
 * It resolves hrefs (which needs document.baseURI) but makes no judgement about
 * them - classification lives in src/lib/links.js, where it can be tested.
 *
 * @returns {object}
 */
export function collectLinks() {
  const MAX_LINKS = 5000;
  const MAX_TEXT = 200;

  const clip = (value) => {
    const trimmed = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) + '…' : trimmed;
  };

  // Inline SVG has its own <a href> elements, which are not page navigation.
  const isHtml = (node) => node.namespaceURI === 'http://www.w3.org/1999/xhtml';

  const anchors = [...document.querySelectorAll('a[href]')].filter(isHtml);
  const links = [];

  for (const anchor of anchors) {
    if (links.length >= MAX_LINKS) break;

    const raw = (anchor.getAttribute('href') || '').trim();

    let href = null;
    try {
      href = new URL(raw, document.baseURI).href;
    } catch {
      href = null;
    }

    const image = anchor.querySelector('img');

    links.push({
      raw,
      href,
      text: clip(anchor.textContent),
      ariaLabel: clip(anchor.getAttribute('aria-label')),
      imageAlt: image ? clip(image.getAttribute('alt')) : '',
      title: clip(anchor.getAttribute('title')),
      rel: clip(anchor.getAttribute('rel')).toLowerCase(),
      target: clip(anchor.getAttribute('target')),
    });
  }

  return {
    url: location.href,
    origin: location.origin,
    title: document.title || '',
    total: anchors.length,
    truncated: anchors.length > MAX_LINKS,
    links,
    collectedAt: new Date().toISOString(),
  };
}
