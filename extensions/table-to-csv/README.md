# Table to CSV

Convert any HTML table to CSV, colspan and rowspan included.

Everything runs inside your browser. No account, no server, no analytics, no stored data.

---

## What it does

- Every `<table>` on the page, listed by caption or by its first row
- `colspan` and `rowspan` expanded into a correct rectangular grid, including `rowspan="0"`
- A preview of the grid before you export it
- Comma, semicolon or tab as the delimiter
- An option to drop rows and columns that are entirely empty

**Copy** puts the CSV on your clipboard. **CSV** downloads it as a file.

## Worth knowing

- Spans are the whole problem. A cell with `rowspan="3"` occupies the same column in the next two rows and pushes later cells to the right; getting that wrong silently misaligns every column after it. The grid builder has a test for each case.
- The CSV is written with a UTF-8 BOM so Excel reads accented characters correctly, and fields that would be executed as formulas are prefixed so they stay text.

---

## Install locally (Load unpacked)

No build step. This folder *is* the extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder - the one containing `manifest.json`.
5. Open any website and click the Table to CSV icon.

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
