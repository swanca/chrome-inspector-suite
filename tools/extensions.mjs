/**
 * The single registry of every extension in this repository.
 *
 * Drives icon generation, shared-code syncing and the root README, so a new
 * extension is declared once here rather than in four places.
 */

/**
 * Version stamped into every manifest, unless an extension overrides it with
 * its own `version` field. Bump this when you ship, so a reload is visible.
 */
export const VERSION = '1.4.0';

export const EXTENSIONS = [
  {
    slug: 'seo-inspector',
    description:
      'Instant on-page SEO, Open Graph and accessibility audit. 100% local - no account, no tracking, no data collected.',
    name: 'SEO Inspector',
    accent: '#4f46e5',
    glyph: 'magnifier',
    tagline: 'On-page SEO, Open Graph and accessibility audit with a verdict per check.',
  },
  {
    slug: 'tracking-inspector',
    description:
      'See every analytics and advertising tag a page loads, with their IDs. 100% local - no tracking, no data collected.',
    name: 'Tracking Inspector',
    accent: '#dc2626',
    glyph: 'target',
    tagline: 'Lists the analytics and advertising tags a page loads, with their IDs.',
  },
  {
    slug: 'shopify-store-inspector',
    description:
      'Inspect any Shopify storefront: theme, currency, products and apps. 100% local - no tracking, no data collected.',
    name: 'Shopify Store Inspector',
    accent: '#16a34a',
    glyph: 'bag',
    tagline: 'Theme, currency, product and app details of any Shopify storefront.',
  },
  {
    slug: 'schema-inspector',
    description:
      'Parse JSON-LD and Microdata, then check the properties each type requires. 100% local - no data collected.',
    name: 'Schema Inspector',
    accent: '#7c3aed',
    glyph: 'graph',
    tagline: 'Parses JSON-LD and Microdata and checks the properties each type requires.',
  },
  {
    slug: 'image-alt-inspector',
    description:
      'Audit every image alt text on a page and export the list as CSV. 100% local - no tracking, no data collected.',
    name: 'Image ALT Inspector',
    accent: '#0891b2',
    glyph: 'picture',
    tagline: 'Every image on the page with its alt text judged, and a CSV export.',
  },
  {
    slug: 'datalayer-viewer',
    description:
      'Browse window.dataLayer as a tree, with its events and GTM containers. 100% local - no data collected.',
    name: 'DataLayer Viewer',
    accent: '#ea580c',
    glyph: 'layers',
    tagline: 'Browse window.dataLayer as a tree, with its events and GTM containers.',
  },
  {
    slug: 'link-extractor',
    description:
      'Extract, filter and export every link on a page as CSV. 100% local - no tracking, no data collected.',
    name: 'Link Extractor',
    accent: '#2563eb',
    glyph: 'chain',
    tagline: 'Extract, filter and export every link on the page as CSV.',
  },
  {
    slug: 'page-to-markdown',
    description:
      'Convert the readable part of any page into clean Markdown. 100% local - no tracking, no data collected.',
    name: 'Page to Markdown',
    accent: '#0f766e',
    glyph: 'document',
    tagline: 'Turn the readable part of a page into clean Markdown.',
  },
  {
    slug: 'table-to-csv',
    description:
      'Convert any HTML table to CSV, colspan and rowspan included. 100% local - no tracking, no data collected.',
    name: 'Table to CSV',
    accent: '#ca8a04',
    glyph: 'grid',
    tagline: 'Convert any HTML table to CSV, colspan and rowspan included.',
  },
  {
    slug: 'tech-stack-detector',
    description:
      'Identify the frameworks, CMS and libraries behind any page. 100% local - no tracking, no data collected.',
    name: 'Tech Stack Detector',
    accent: '#0284c7',
    glyph: 'chip',
    tagline: 'Identify the frameworks, CMS and libraries behind a page.',
  },
];

/** @param {string} slug @returns {object} */
export function extensionBySlug(slug) {
  const match = EXTENSIONS.find((item) => item.slug === slug);
  if (!match) throw new Error('Unknown extension slug: ' + slug);
  return match;
}
