/**
 * Image collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript(). It must therefore
 * be entirely self-contained: no imports, no references to module scope.
 *
 * It records what each image declares, without judging it. The rules live in
 * src/lib/alt.js, where they can be tested.
 *
 * @returns {object}
 */
export function collectImages() {
  const MAX_IMAGES = 2000;
  const MAX_TEXT = 300;

  const clip = (value) => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).replace(/\s+/g, ' ').trim();
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

  const record = (element, kind, rawSrc) => ({
    kind,
    // null means "the attribute is absent", which is very different from "".
    alt: element.hasAttribute('alt') ? clip(element.getAttribute('alt')) || '' : null,
    src: absolute(rawSrc),
    rawSrc: clip(rawSrc) || '',
    title: clip(element.getAttribute('title')) || '',
    role: (element.getAttribute('role') || '').toLowerCase(),
    ariaHidden: element.getAttribute('aria-hidden') === 'true',
    ariaLabel: clip(element.getAttribute('aria-label')) || '',
    loading: (element.getAttribute('loading') || '').toLowerCase(),
    width: Number(element.width) || 0,
    height: Number(element.height) || 0,
    naturalWidth: Number(element.naturalWidth) || 0,
    naturalHeight: Number(element.naturalHeight) || 0,
    inLink: Boolean(element.closest('a[href]')),
  });

  const images = [];

  for (const element of document.querySelectorAll('img')) {
    if (images.length >= MAX_IMAGES) break;
    images.push(record(element, 'img', element.getAttribute('src') || element.currentSrc || ''));
  }

  for (const element of document.querySelectorAll('input[type="image"]')) {
    if (images.length >= MAX_IMAGES) break;
    images.push(record(element, 'input', element.getAttribute('src') || ''));
  }

  for (const element of document.querySelectorAll('area')) {
    if (images.length >= MAX_IMAGES) break;
    images.push(record(element, 'area', element.getAttribute('href') || ''));
  }

  // Inline SVG used as an image needs a label too, but carries it differently.
  for (const element of document.querySelectorAll('svg[role="img"]')) {
    if (images.length >= MAX_IMAGES) break;
    const title = element.querySelector('title');
    images.push({
      kind: 'svg',
      alt: element.getAttribute('aria-label') || (title ? clip(title.textContent) : null),
      src: '',
      rawSrc: '(inline svg)',
      title: '',
      role: 'img',
      ariaHidden: element.getAttribute('aria-hidden') === 'true',
      ariaLabel: clip(element.getAttribute('aria-label')) || '',
      loading: '',
      width: 0,
      height: 0,
      naturalWidth: 0,
      naturalHeight: 0,
      inLink: Boolean(element.closest('a[href]')),
    });
  }

  return {
    url: location.href,
    title: document.title || '',
    total: images.length,
    truncated: images.length >= MAX_IMAGES,
    images: images.map((image, index) => ({ index, ...image })),
    collectedAt: new Date().toISOString(),
  };
}
