/**
 * Chrome Web Store listing data.
 *
 * Kept apart from the registry because these are marketing decisions, not
 * technical ones, and they change on a different clock.
 *
 * `storeName` is what appears in the store and is the heaviest signal in its
 * search. The convention is `Name - descriptive phrase`, well under the 75
 * character limit. A phrase is accepted; a pile of keywords gets the submission
 * rejected, so every one of these reads as a sentence a human would write.
 *
 * `queries` are the searches each listing is written to answer. They are not
 * stuffed anywhere - they inform the wording of the name and the description.
 *
 * `shots` is the screenshot plan. Chrome requires at least one 1280x800 image
 * and they are the single biggest factor in whether a visitor installs.
 */

export const CATEGORIES = Object.freeze({
  'seo-inspector': 'Developer Tools',
  'tracking-inspector': 'Developer Tools',
  'shopify-store-inspector': 'Developer Tools',
  'schema-inspector': 'Developer Tools',
  'image-alt-inspector': 'Accessibility',
  'datalayer-viewer': 'Developer Tools',
  'link-extractor': 'Developer Tools',
  'page-to-markdown': 'Productivity',
  'table-to-csv': 'Productivity',
  'tech-stack-detector': 'Developer Tools',
});

export const LISTINGS = Object.freeze({
  'seo-inspector': {
    storeName: 'SEO Inspector - On-Page SEO, Meta Tags & Open Graph Audit',
    singlePurpose:
      'Audits the SEO, Open Graph and accessibility markup of the page the user is viewing, and shows the result in the popup.',
    queries: [
      'seo checker', 'meta tag inspector', 'open graph preview', 'on page seo',
      'seo audit extension', 'meta description checker', 'canonical tag checker',
    ],
    hook: 'Every SEO problem on the page you are looking at, in one click.',
    shots: [
      'The popup on a page with a few problems - the header showing "2 errors, 3 warnings", the findings list visible underneath.',
      'The same page with "Issues only" ticked, so the list is short and every row is a problem.',
      'The Social sharing group, with the Open Graph preview card rendered.',
      'A clean page: the header pill reading "All checks passed".',
      'The Markdown report pasted into a GitHub issue, to show what Copy produces.',
    ],
  },

  'tracking-inspector': {
    storeName: 'Tracking Inspector - Find GTM, GA4, Meta Pixel & Trackers',
    singlePurpose:
      'Lists the analytics and advertising tags loaded by the page the user is viewing, with the evidence for each.',
    queries: [
      'tracking pixel detector', 'gtm detector', 'google tag assistant alternative',
      'facebook pixel helper', 'find tracking scripts', 'ga4 checker', 'cookie tracker detector',
    ],
    hook: 'See every analytics and advertising tag a site loads, and its ID.',
    shots: [
      'A heavily tracked site: the popup grouped by category, with eight or more trackers listed.',
      'The Tag identifiers section, showing a real GTM container and a Meta Pixel ID.',
      'The warning banner on a site that loads advertising tags with no consent platform.',
      'The evidence tags under one tracker - the global, the script domain, the cookie name.',
      'A clean site: "No known trackers on this page."',
    ],
  },

  'shopify-store-inspector': {
    storeName: 'Shopify Store Inspector - Theme, Apps & Product Data',
    singlePurpose:
      'Reads and reports the theme, product and app data that a Shopify storefront publishes about itself.',
    queries: [
      'shopify theme detector', 'what shopify theme is this', 'shopify apps detector',
      'shopify spy', 'shopify store inspector', 'shopify theme finder', 'shopify product data',
    ],
    hook: 'The theme, the apps, the product data and what is wrong with the page - on any Shopify store.',
    shots: [
      'The Audit tab on a real product page, showing findings with their FAIL and WARN badges.',
      'The Details tab: shop, currency, theme name and whether it came from the Theme Store.',
      'The Variants tab: a table of SKUs, prices and stock.',
      'The Apps detected section, with a dozen app chips visible.',
      'A non-Shopify page, showing the extension says so plainly rather than guessing.',
    ],
  },

  'schema-inspector': {
    storeName: 'Schema Inspector - JSON-LD & Microdata Structured Data',
    singlePurpose:
      'Parses the structured data on the page the user is viewing and checks it against the properties each schema.org type requires.',
    queries: [
      'structured data testing tool', 'json-ld validator', 'schema markup checker',
      'rich results test', 'microdata viewer', 'schema.org validator',
    ],
    hook: 'Read the structured data on any page, and see what it is missing.',
    shots: [
      'A product page: the entity list with per-property OK, WARN and FAIL rows.',
      'A page with a broken JSON-LD block, showing the parser error and the excerpt.',
      'The raw data tree expanded for one entity.',
      'A page carrying several entity types - Product, Organization, BreadcrumbList.',
      'The header pill summarising "4 entities, 2 warnings".',
    ],
  },

  'image-alt-inspector': {
    storeName: 'Image ALT Inspector - Alt Text & Accessibility Checker',
    singlePurpose:
      'Lists every image on the page the user is viewing and judges its alt text.',
    queries: [
      'alt text checker', 'image alt viewer', 'missing alt attribute',
      'accessibility checker images', 'alt tag checker', 'wcag image audit',
    ],
    hook: 'Every image on the page, with its alt text judged - and a CSV of the lot.',
    shots: [
      'A page with problems: thumbnails down the left, FAIL badges on images with no alt.',
      'The filter set to "Missing alt", so the list is only the failures.',
      'A row showing weak alt text - "alt is just the file name".',
      'A well-built page where every image passes.',
      'The CSV export open in a spreadsheet, showing the (missing) marker.',
    ],
  },

  'datalayer-viewer': {
    storeName: 'DataLayer Viewer - Inspect the GTM dataLayer & Events',
    singlePurpose:
      'Displays the data layer objects published by the page the user is viewing.',
    queries: [
      'datalayer inspector', 'gtm datalayer viewer', 'google tag manager debug',
      'datalayer checker', 'dataLayer chrome extension', 'gtm event viewer',
    ],
    hook: 'Browse window.dataLayer as a tree, without opening the console.',
    shots: [
      'An e-commerce page: the dataLayer entries as a tree, one expanded to show an ecommerce object.',
      'The event filter open, listing purchase, page_view and the rest with their counts.',
      'The search box filtering to a single key across every entry.',
      'The header showing the GTM container ID found on the page.',
      'A page with no data layer, stating so clearly.',
    ],
  },

  'link-extractor': {
    storeName: 'Link Extractor - Export All Page Links to CSV',
    singlePurpose:
      'Extracts the links from the page the user is viewing and lets them be filtered, copied and exported.',
    queries: [
      'link extractor', 'extract all links', 'copy all links from page',
      'export links to csv', 'link grabber', 'get all urls from page',
    ],
    hook: 'Every link on the page, filtered how you want, exported as CSV.',
    shots: [
      'A link-heavy page with the full list and the counts in the header.',
      'The scope set to External, with the search box narrowing further.',
      'The "Unique" toggle on, showing the count drop.',
      'A row for an unlabelled link, flagged as having no link text.',
      'The CSV open in a spreadsheet, columns url, text, type, rel, target.',
    ],
  },

  'page-to-markdown': {
    storeName: 'Page to Markdown - Copy Any Web Page as Markdown',
    singlePurpose:
      'Converts the readable content of the page the user is viewing into Markdown.',
    queries: [
      'html to markdown', 'copy page as markdown', 'web page to markdown',
      'article to markdown', 'save page as md', 'markdown converter extension',
    ],
    hook: 'Turn any article into clean Markdown, ready to paste.',
    shots: [
      'A long article with the Markdown preview in the popup.',
      'The result pasted into a Markdown editor, rendering identically.',
      'The Links and Images toggles off, showing the output change.',
      'Front matter switched on, with the YAML block at the top.',
      'A page with code blocks and a table, converted correctly.',
    ],
  },

  'table-to-csv': {
    storeName: 'Table to CSV - Export HTML Tables to Excel & CSV',
    singlePurpose:
      'Converts an HTML table on the page the user is viewing into CSV.',
    queries: [
      'html table to csv', 'export table to excel', 'copy table from website',
      'scrape table to csv', 'web table downloader', 'table extractor',
    ],
    hook: 'Any table on any page, in a spreadsheet, in two clicks.',
    shots: [
      'A Wikipedia page with merged cells, the popup previewing the flattened grid.',
      'The table picker open, listing every table on the page.',
      'The exported CSV open in Excel, columns correctly aligned despite the merges.',
      'The delimiter set to semicolon, for European Excel.',
      '"Drop empty rows and columns" switched on, cleaning up a layout table.',
    ],
  },

  'tech-stack-detector': {
    storeName: 'Tech Stack Detector - Frameworks, CMS & Libraries',
    singlePurpose:
      'Identifies the frameworks, CMS and libraries used by the page the user is viewing.',
    queries: [
      'what technology is this site using', 'wappalyzer alternative', 'cms detector',
      'framework detector', 'built with', 'website technology checker', 'find website stack',
    ],
    hook: 'Find out what any site is built with, in one click.',
    shots: [
      'A Next.js site: React, Next.js, Tailwind and webpack grouped by category, with versions.',
      'A WordPress shop: WordPress, WooCommerce, Elementor and jQuery.',
      'The evidence tags under one detection, showing why it was identified.',
      '"Confident only" ticked, hiding the single-signal guesses.',
      'A plain HTML page, where the extension says it recognised nothing.',
    ],
  },
});
