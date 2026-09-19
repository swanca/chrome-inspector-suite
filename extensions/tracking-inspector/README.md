# Tracking Inspector

Lists the analytics and advertising tags a page loads, with their IDs.

Everything runs inside your browser. No account, no server, no analytics, no stored data.

---

## What it does

- Over forty analytics, advertising, session-replay, support and monitoring tags
- Consent management platforms - OneTrust, Cookiebot, Didomi, Axeptio, Usercentrics and others
- The evidence for each detection: the page global, the loaded script, or the cookie name
- Tag identifiers pulled from scripts and inline snippets - GTM containers, GA4 measurement IDs, Universal Analytics, Google Ads, Meta Pixel, Hotjar and Clarity
- A warning when advertising or session-replay tags load with no consent platform present

**Copy** puts a Markdown report on your clipboard. **CSV** downloads one row per tracker.

## Worth knowing

- Cookie **names** are read, cookie **values** are never read. A name tells you a tracker is present; the value is the identifier itself, and this extension has no reason to touch it.
- Detection is a snapshot of the moment you open the popup. A tag that only fires after consent, or later in the page lifecycle, will not appear until you reopen it.
- Host matching is done by parsing, never by substring: `google-analytics.com.evil.test` is not Google Analytics.

## What you get

Everything. There is no paid tier, no account and no trial - every feature below works the moment you install it.

- Export as CSV
- Tag identifier extraction

---

## Install locally (Load unpacked)

No build step. This folder *is* the extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder - the one containing `manifest.json`.
5. Open any website and click the Tracking Inspector icon.

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
