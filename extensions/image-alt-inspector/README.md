# Image ALT Inspector

Every image on the page with its alt text judged, and a CSV export.

Everything runs inside your browser. No account, no server, no analytics, no stored data.

---

## What it does

- Every `<img>`, `<input type="image">`, `<area>` and `<svg role="img">` on the page
- A **missing** `alt` attribute reported as a failure
- An **empty** `alt=""` recognised as correct - it marks the image decorative
- An empty `alt` inside a link reported as a failure, because the link loses its name
- Weak alt text: over 125 characters, placeholder words, redundant "photo of" prefixes, or text that merely repeats the file name
- Thumbnails, so you can see what each row is talking about

**Copy** puts the rows on your clipboard as CSV. **CSV** downloads them as a file.

## Worth knowing

- The distinction this tool exists to make: a **missing** `alt` is a failure, because assistive technology falls back to reading the file name. An **empty** `alt=""` is correct and deliberate. Conflating the two is the classic false positive, so the export writes `(missing)` rather than leaving a blank cell.
- Images marked `aria-hidden="true"` or `role="presentation"` are reported as deliberately hidden, not as problems.

## What you get

Everything. There is no paid tier, no account and no trial - every feature below works the moment you install it.

- Export as CSV

---

## Install locally (Load unpacked)

No build step. This folder *is* the extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder - the one containing `manifest.json`.
5. Open any website and click the Image ALT Inspector icon.

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
