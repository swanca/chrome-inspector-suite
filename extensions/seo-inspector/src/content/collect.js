/**
 * Page data collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript(). It must therefore
 * be entirely self-contained: no imports, no references to module scope, and
 * only values that survive structured cloning in its return value.
 *
 * It only reads the DOM. It never writes to the page and never sends anything
 * anywhere.
 *
 * @returns {object} Raw, unjudged facts about the page. See src/lib/audit.js
 *                   for the rules applied to this shape.
 */
export function collectPageData() {
  const MAX_SAMPLES = 5;
  const MAX_HEADINGS = 100;
  const MAX_TEXT = 300;

  const clip = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) return null;
    return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) + '\u2026' : trimmed;
  };

  const metaByName = (name) => {
    const nodes = document.querySelectorAll(
      'meta[name="' + name + '"], meta[property="' + name + '"]'
    );
    return { value: nodes.length ? clip(nodes[0].getAttribute('content')) : null, count: nodes.length };
  };

  const meta = (name) => metaByName(name).value;

  const absolute = (href) => {
    if (!href) return null;
    try {
      return new URL(href, document.baseURI).href;
    } catch {
      return null;
    }
  };

  // Inline SVG has its own <title> and <a href> elements. They share a tag name
  // with the HTML ones but mean something completely different, so every query
  // that could collide with SVG is filtered back down to the HTML namespace.
  const isHtml = (node) => node.namespaceURI === 'http://www.w3.org/1999/xhtml';

  // --- Title -----------------------------------------------------------------
  // Scoped to <head>: an SVG <title> is a tooltip, not the document title.
  const titleNodes = [...document.querySelectorAll('title')].filter(
    (node) => isHtml(node) && node.parentElement === document.head
  );
  const title = titleNodes.length ? clip(titleNodes[0].textContent) : null;

  // --- Canonical -------------------------------------------------------------
  const canonicalNodes = document.querySelectorAll('link[rel="canonical"]');
  const canonicalRaw = canonicalNodes.length
    ? (canonicalNodes[0].getAttribute('href') || '').trim()
    : null;

  // --- Headings --------------------------------------------------------------
  const headings = [];
  const headingNodes = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (let i = 0; i < headingNodes.length && headings.length < MAX_HEADINGS; i++) {
    const node = headingNodes[i];
    headings.push({
      level: Number(node.tagName.slice(1)),
      text: clip(node.textContent) || '',
    });
  }

  // --- Images ----------------------------------------------------------------
  const imageNodes = document.querySelectorAll('img');
  let missingAlt = 0;
  let decorativeAlt = 0;
  const missingAltSamples = [];
  for (const img of imageNodes) {
    if (!img.hasAttribute('alt')) {
      missingAlt++;
      if (missingAltSamples.length < MAX_SAMPLES) {
        missingAltSamples.push(img.getAttribute('src') || '(no src)');
      }
    } else if (img.getAttribute('alt').trim() === '') {
      decorativeAlt++;
    }
  }

  // --- Links -----------------------------------------------------------------
  const linkNodes = [...document.querySelectorAll('a[href]')].filter(isHtml);
  let internal = 0;
  let external = 0;
  let nofollow = 0;
  let emptyText = 0;
  const emptyTextSamples = [];
  for (const link of linkNodes) {
    const href = link.getAttribute('href') || '';
    if (/^(?:javascript:|mailto:|tel:|#)/i.test(href)) continue;

    const resolved = absolute(href);
    if (!resolved) continue;

    if (resolved.startsWith(location.origin)) internal++;
    else external++;

    if ((link.getAttribute('rel') || '').toLowerCase().includes('nofollow')) nofollow++;

    const label =
      (link.textContent || '').trim() ||
      (link.getAttribute('aria-label') || '').trim() ||
      (link.querySelector('img[alt]')?.getAttribute('alt') || '').trim();
    if (!label) {
      emptyText++;
      if (emptyTextSamples.length < MAX_SAMPLES) emptyTextSamples.push(resolved);
    }
  }

  // --- hreflang --------------------------------------------------------------
  const hreflang = [];
  for (const node of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    hreflang.push({
      lang: node.getAttribute('hreflang'),
      href: absolute(node.getAttribute('href')),
    });
    if (hreflang.length >= 20) break;
  }

  // --- Structured data -------------------------------------------------------
  const structuredData = [];
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(node.textContent);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        const type = entry && entry['@type'];
        structuredData.push(Array.isArray(type) ? type.join(', ') : String(type || 'Unknown'));
      }
    } catch {
      structuredData.push('Invalid JSON-LD');
    }
    if (structuredData.length >= 20) break;
  }

  // --- Word count ------------------------------------------------------------
  const bodyText = document.body ? document.body.innerText || '' : '';
  const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;

  const descriptionMeta = metaByName('description');

  return {
    url: location.href,
    origin: location.origin,
    protocol: location.protocol,

    lang: (document.documentElement.getAttribute('lang') || '').trim() || null,
    charset: document.characterSet || null,
    hasCharsetTag: Boolean(document.querySelector('meta[charset], meta[http-equiv="Content-Type"]')),
    viewport: meta('viewport'),

    title,
    titleCount: titleNodes.length,

    description: descriptionMeta.value,
    descriptionCount: descriptionMeta.count,

    canonical: absolute(canonicalRaw),
    canonicalRaw,
    canonicalCount: canonicalNodes.length,

    robots: meta('robots'),
    author: meta('author'),
    themeColor: meta('theme-color'),

    og: {
      title: meta('og:title'),
      description: meta('og:description'),
      image: absolute(meta('og:image')),
      url: meta('og:url'),
      type: meta('og:type'),
      siteName: meta('og:site_name'),
      imageAlt: meta('og:image:alt'),
    },

    twitter: {
      card: meta('twitter:card'),
      title: meta('twitter:title'),
      description: meta('twitter:description'),
      image: absolute(meta('twitter:image')),
      site: meta('twitter:site'),
    },

    headings,
    h1Count: document.querySelectorAll('h1').length,

    images: {
      total: imageNodes.length,
      missingAlt,
      decorativeAlt,
      missingAltSamples,
    },

    links: {
      total: linkNodes.length,
      internal,
      external,
      nofollow,
      emptyText,
      emptyTextSamples,
    },

    hreflang,
    structuredData,
    wordCount,
    collectedAt: new Date().toISOString(),
  };
}
