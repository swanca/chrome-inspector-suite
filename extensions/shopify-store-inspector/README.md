# Shopify Store Inspector

Theme, currency, product and app details of any Shopify storefront.

Everything runs inside your browser. No account, no server, no analytics, no stored data.

---

## What it does

- Shop domain, currency, locale, country and whether a customer is logged in
- Theme name, version, ID, and whether it came from the Theme Store or is bespoke
- A warning when the theme is not the live one, or when you are inside the theme editor preview
- Page type and resource, product ID, vendor, type and variant count
- Variant table with SKUs and prices, correctly converted from Shopify's integer cents
- Around two dozen Shopify apps, detected from the scripts they load

**Copy** puts a Markdown report on your clipboard. **CSV** downloads every field.

## Worth knowing

- Shopify publishes prices as integer cents: `19900` means `199.00`. Reading that as a plain number would be a hundredfold error on every price, so the conversion has its own tests.
- When only the Shopify CDN is detected and no `window.Shopify` global exists, the popup says so rather than pretending to be certain.

## What you get

Everything. There is no paid tier, no account and no trial - every feature below works the moment you install it.

- Export as CSV
- Storefront audit
- Variant table

---

## Install locally (Load unpacked)

No build step. This folder *is* the extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder - the one containing `manifest.json`.
5. Open any website and click the Shopify Store Inspector icon.

To pick up code changes, press the reload arrow on the extension card in `chrome://extensions`, then reopen the popup.

## Permissions

| Permission  | Why |
|-------------|-----|
| `activeTab` | Grants access to the current tab **only at the moment you click the icon**, and only until you navigate away. This is why no `host_permissions` are needed and the extension has no access to your browsing history. |
| `scripting` | Required to run the read-only collector in the page and read what it needs. |
| `storage`   | Keeps a single first-run timestamp on this device. Nothing else is stored, and nothing is ever transmitted. |

That is the complete list. There is no background service worker, no `tabs` permission and no host permissions.

## Privacy

The extension reads the page you explicitly ask it to inspect, keeps the result in the popup's memory, and forgets it when the popup closes. Nothing is written to disk unless *you* click an export button, and nothing is ever transmitted.

## Pages that cannot be inspected

Chrome forbids extensions from running on some pages, and the popup explains which case you have hit instead of failing silently:

- `chrome://`, `about:`, `devtools://`, `view-source:` and other browser pages
- The Chrome Web Store
- `file://` URLs, unless you enable *Allow access to file URLs* on the extension's details page

## Development

This extension is part of a suite. Tests, shared code and tooling live at the repository root:

```bash
npm test
```

Files under `src/shared/` and `src/popup/base.css` are generated from the repository's `shared/` folder. Edit the source there and run `npm run sync`, never the copies.

See the root [README](../../README.md) for the full picture.

## Licence

MIT.
