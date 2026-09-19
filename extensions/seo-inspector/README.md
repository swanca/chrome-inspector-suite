# SEO Inspector

On-page SEO, Open Graph and accessibility audit with a verdict per check.

Everything runs inside your browser. No account, no server, no analytics, no stored data.

---

## What it does

- `<title>` and meta description - presence, uniqueness and length against the 30-60 and 70-160 character guidelines
- Canonical URL - present, single, and absolute
- Robots directives - flags `noindex` and `nofollow`
- `lang` attribute, charset declaration, viewport and HTTPS
- Open Graph and `twitter:card`, with a live preview of the shared link
- Exactly one `<h1>`, and a heading outline with no skipped levels
- Images missing `alt`, links with no discernible label
- JSON-LD structured data, including blocks that fail to parse

**Copy** puts a Markdown report on your clipboard. **Export JSON** downloads the full audit including the raw page data.

## Worth knowing

- The social preview card renders `og:image` in an `<img>` tag, which fetches that image from wherever the page already hosts it, with `referrerpolicy="no-referrer"`. That is the only network request any of these extensions makes, and it is the same request the page itself would make.

---

## Install locally (Load unpacked)

No build step. This folder *is* the extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder - the one containing `manifest.json`.
5. Open any website and click the SEO Inspector icon.

To pick up code changes, press the reload arrow on the extension card in `chrome://extensions`, then reopen the popup.

## Permissions

| Permission  | Why |
|-------------|-----|
| `activeTab` | Grants access to the current tab **only at the moment you click the icon**, and only until you navigate away. This is why no `host_permissions` are needed and the extension has no access to your browsing history. |
| `scripting` | Required to run the read-only collector in the page and read what it needs. |

That is the complete list. There is no background service worker, no `storage`, no `tabs` permission and no host permissions.

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
