/**
 * What each extension is, in prose.
 *
 * Shared by the README generator and the store-listing generator, so the two
 * can never drift apart.
 */

/** Per-extension content: what it does, and anything specific worth knowing. */
export const CONTENT = {
  'seo-inspector': {
    features: [
      '`<title>` and meta description - presence, uniqueness and length against the 30-60 and 70-160 character guidelines',
      'Canonical URL - present, single, and absolute',
      'Robots directives - flags `noindex` and `nofollow`',
      '`lang` attribute, charset declaration, viewport and HTTPS',
      'Open Graph and `twitter:card`, with a live preview of the shared link',
      'Exactly one `<h1>`, and a heading outline with no skipped levels',
      'Images missing `alt`, links with no discernible label',
      'JSON-LD structured data, including blocks that fail to parse',
    ],
    outputs: '**Copy** puts a Markdown report on your clipboard. **Export JSON** downloads the full audit including the raw page data.',
    notes: [
      'The social preview card renders `og:image` in an `<img>` tag, which fetches that image from wherever the page already hosts it, with `referrerpolicy="no-referrer"`. That is the only network request any of these extensions makes, and it is the same request the page itself would make.',
    ],
  },
  'tracking-inspector': {
    features: [
      'Over forty analytics, advertising, session-replay, support and monitoring tags',
      'Consent management platforms - OneTrust, Cookiebot, Didomi, Axeptio, Usercentrics and others',
      'The evidence for each detection: the page global, the loaded script, or the cookie name',
      'Tag identifiers pulled from scripts and inline snippets - GTM containers, GA4 measurement IDs, Universal Analytics, Google Ads, Meta Pixel, Hotjar and Clarity',
      'A warning when advertising or session-replay tags load with no consent platform present',
    ],
    outputs: '**Copy** puts a Markdown report on your clipboard. **CSV** downloads one row per tracker.',
    notes: [
      'Cookie **names** are read, cookie **values** are never read. A name tells you a tracker is present; the value is the identifier itself, and this extension has no reason to touch it.',
      'Detection is a snapshot of the moment you open the popup. A tag that only fires after consent, or later in the page lifecycle, will not appear until you reopen it.',
      'Host matching is done by parsing, never by substring: `google-analytics.com.evil.test` is not Google Analytics.',
    ],
  },
  'shopify-store-inspector': {
    features: [
      'Shop domain, currency, locale, country and whether a customer is logged in',
      'Theme name, version, ID, and whether it came from the Theme Store or is bespoke',
      'A warning when the theme is not the live one, or when you are inside the theme editor preview',
      'Page type and resource, product ID, vendor, type and variant count',
      'Variant table with SKUs and prices, correctly converted from Shopify\'s integer cents',
      'Around two dozen Shopify apps, detected from the scripts they load',
    ],
    outputs: '**Copy** puts a Markdown report on your clipboard. **CSV** downloads every field.',
    notes: [
      'Shopify publishes prices as integer cents: `19900` means `199.00`. Reading that as a plain number would be a hundredfold error on every price, so the conversion has its own tests.',
      'When only the Shopify CDN is detected and no `window.Shopify` global exists, the popup says so rather than pretending to be certain.',
    ],
  },
  'schema-inspector': {
    features: [
      'JSON-LD, including `@graph` wrappers, arrays and nested entities',
      'Microdata - `itemscope`, `itemtype` and `itemprop`, with nested items',
      'Required and recommended properties for twenty schema.org types, including Product, Offer, Article, LocalBusiness, FAQPage, Recipe, Event, JobPosting and VideoObject',
      'Blocks that fail to parse, reported with the parser error and an excerpt',
      'The raw parsed data as a collapsible tree',
    ],
    outputs: '**Copy** puts a Markdown report on your clipboard. **Export JSON** downloads every entity with its findings.',
    notes: [
      'A missing **required** property is an error; a missing **recommended** one is only a warning. Unknown types are reported as unchecked rather than as broken.',
      'Type aliases are handled: a `BlogPosting` is validated against the `Article` requirements.',
    ],
  },
  'image-alt-inspector': {
    features: [
      'Every `<img>`, `<input type="image">`, `<area>` and `<svg role="img">` on the page',
      'A **missing** `alt` attribute reported as a failure',
      'An **empty** `alt=""` recognised as correct - it marks the image decorative',
      'An empty `alt` inside a link reported as a failure, because the link loses its name',
      'Weak alt text: over 125 characters, placeholder words, redundant "photo of" prefixes, or text that merely repeats the file name',
      'Thumbnails, so you can see what each row is talking about',
    ],
    outputs: '**Copy** puts the rows on your clipboard as CSV. **CSV** downloads them as a file.',
    notes: [
      'The distinction this tool exists to make: a **missing** `alt` is a failure, because assistive technology falls back to reading the file name. An **empty** `alt=""` is correct and deliberate. Conflating the two is the classic false positive, so the export writes `(missing)` rather than leaving a blank cell.',
      'Images marked `aria-hidden="true"` or `role="presentation"` are reported as deliberately hidden, not as problems.',
    ],
  },
  'datalayer-viewer': {
    features: [
      '`window.dataLayer`, plus `digitalData`, `utag_data` and any other array whose name looks like a data layer',
      'Each entry as a collapsible tree, numbered in push order',
      'Event names for both shapes that coexist in the wild: GTM objects (`{event: "purchase"}`) and gtag arrays (`["event", "purchase", {...}]`)',
      'Filter by event name, and search across every key and value',
      'GTM container IDs found on the page',
      'A Refresh button, since the data layer keeps growing while you browse',
    ],
    outputs: '**Copy** puts the visible entries on your clipboard as JSON. **JSON** downloads the whole capture.',
    notes: [
      'Real data layers contain functions, DOM nodes and circular references, none of which survive the structured clone that carries data out of the page. The collector sanitises them in place - cycles become `[Circular]`, functions become `[Function name]` - because that sanitiser has to run inside the page and therefore cannot be imported from `src/lib/`. It is covered by the browser smoke test rather than by unit tests; everything downstream of it is unit-tested.',
    ],
  },
  'link-extractor': {
    features: [
      'Every link on the page with its resolved URL, text, `rel` and `target`',
      'Categories: internal, external, anchors, `mailto:`, `tel:` and `javascript:`',
      'Filters for nofollow links and for links with no discernible label',
      'A search box matching both the URL and the link text',
      'A "Unique" toggle that keeps only the first link per URL',
    ],
    outputs: '**Copy** puts one URL per line on your clipboard. **CSV** downloads the full table.',
    notes: [
      'Internal versus external is decided by parsing and comparing origins, never by prefix matching: `https://example.com.evil.test` is not part of `https://example.com`.',
      'Links inside inline SVG are ignored - they share a tag name with HTML anchors but are not page navigation.',
    ],
  },
  'page-to-markdown': {
    features: [
      'Headings, paragraphs, lists (nested and ordered), code blocks with their language, blockquotes, tables, images and figures',
      'Emphasis, strong, strikethrough, inline code and links',
      'Toggles to strip links or images',
      'Optional YAML front matter with the title, source URL, description and capture time',
      'A live preview of the Markdown before you copy it',
    ],
    outputs: '**Copy** puts the Markdown on your clipboard. **.md** downloads it as a file.',
    notes: [
      'The readable part of the page is found by trying `article`, `main`, `[role="main"]`, `#content` and `.post` in turn, falling back to `body`. Navigation, headers, footers and asides are skipped.',
      'Page text is escaped so it survives as literal text: a line starting `1.` becomes `1\\.`, not `\\1.`, because the latter is not a valid Markdown escape and would render the backslash.',
    ],
  },
  'table-to-csv': {
    features: [
      'Every `<table>` on the page, listed by caption or by its first row',
      '`colspan` and `rowspan` expanded into a correct rectangular grid, including `rowspan="0"`',
      'A preview of the grid before you export it',
      'Comma, semicolon or tab as the delimiter',
      'An option to drop rows and columns that are entirely empty',
    ],
    outputs: '**Copy** puts the CSV on your clipboard. **CSV** downloads it as a file.',
    notes: [
      'Spans are the whole problem. A cell with `rowspan="3"` occupies the same column in the next two rows and pushes later cells to the right; getting that wrong silently misaligns every column after it. The grid builder has a test for each case.',
      'The CSV is written with a UTF-8 BOM so Excel reads accented characters correctly, and fields that would be executed as formulas are prefixed so they stay text.',
    ],
  },
  'tech-stack-detector': {
    features: [
      'Frameworks: React, Vue, Angular, AngularJS, Svelte, Ember, Alpine, htmx, Stimulus, Livewire',
      'Meta frameworks: Next.js, Nuxt, SvelteKit, Remix, Astro, Turbo, Blazor',
      'CMS and site builders: WordPress, Elementor, Drupal, Joomla, Ghost, Webflow, Squarespace, Wix, HubSpot',
      'E-commerce: Shopify, WooCommerce, PrestaShop, Magento, BigCommerce',
      'UI, libraries and build tooling, with versions where the page exposes them',
      'The evidence behind each detection, and a confidence level',
    ],
    outputs: '**Copy** puts a Markdown list on your clipboard. **CSV** downloads the full table.',
    notes: [
      'A single signal is reported as low confidence and labelled a guess. Tick "Confident only" to hide those.',
      'Angular and AngularJS are never both reported: modern Angular apps can still expose `window.angular`, so a signal unique to modern Angular breaks the tie.',
    ],
  },
};
