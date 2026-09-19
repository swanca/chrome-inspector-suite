# DataLayer Viewer

Browse window.dataLayer as a tree, with its events and GTM containers.

Everything runs inside your browser. No account, no server, no analytics, no stored data.

---

## What it does

- `window.dataLayer`, plus `digitalData`, `utag_data` and any other array whose name looks like a data layer
- Each entry as a collapsible tree, numbered in push order
- Event names for both shapes that coexist in the wild: GTM objects (`{event: "purchase"}`) and gtag arrays (`["event", "purchase", {...}]`)
- Filter by event name, and search across every key and value
- GTM container IDs found on the page
- A Refresh button, since the data layer keeps growing while you browse

**Copy** puts the visible entries on your clipboard as JSON. **JSON** downloads the whole capture.

## Worth knowing

- Real data layers contain functions, DOM nodes and circular references, none of which survive the structured clone that carries data out of the page. The collector sanitises them in place - cycles become `[Circular]`, functions become `[Function name]` - because that sanitiser has to run inside the page and therefore cannot be imported from `src/lib/`. It is covered by the browser smoke test rather than by unit tests; everything downstream of it is unit-tested.

## What you get

Everything. There is no paid tier, no account and no trial - every feature below works the moment you install it.

- Export as JSON
- Live refresh

---

## Install locally (Load unpacked)

No build step. This folder *is* the extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder - the one containing `manifest.json`.
5. Open any website and click the DataLayer Viewer icon.

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
