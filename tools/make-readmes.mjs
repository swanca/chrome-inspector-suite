/**
 * Generates one README per extension.
 *
 * The install steps, permission rationale and privacy statement are identical
 * for all ten, so they live here rather than being copy-pasted and drifting.
 * What differs per extension is the feature list below.
 *
 * Usage: node tools/make-readmes.mjs
 */

import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS } from './extensions.mjs';
import { CONTENT } from './content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readmeFor(extension) {
  const content = CONTENT[extension.slug];
  if (!content) throw new Error('No README content for ' + extension.slug);

  const lines = [];

  lines.push('# ' + extension.name);
  lines.push('');
  lines.push(extension.tagline);
  lines.push('');
  lines.push(
    'Everything runs inside your browser. No account, no server, no analytics, no stored data.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## What it does');
  lines.push('');
  for (const feature of content.features) lines.push('- ' + feature);
  lines.push('');
  lines.push(content.outputs);
  lines.push('');

  if (content.notes && content.notes.length) {
    lines.push('## Worth knowing');
    lines.push('');
    for (const note of content.notes) lines.push('- ' + note);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Install locally (Load unpacked)');
  lines.push('');
  lines.push('No build step. This folder *is* the extension.');
  lines.push('');
  lines.push('1. Open `chrome://extensions` in Chrome.');
  lines.push('2. Turn on **Developer mode** (top-right toggle).');
  lines.push('3. Click **Load unpacked**.');
  lines.push('4. Select this folder - the one containing `manifest.json`.');
  lines.push('5. Open any website and click the ' + extension.name + ' icon.');
  lines.push('');
  lines.push(
    'To pick up code changes, press the reload arrow on the extension card in `chrome://extensions`, then reopen the popup.'
  );
  lines.push('');

  lines.push('## Permissions');
  lines.push('');
  lines.push('| Permission  | Why |');
  lines.push('|-------------|-----|');
  lines.push(
    '| `activeTab` | Grants access to the current tab **only at the moment you click the icon**, and only until you navigate away. This is why no `host_permissions` are needed and the extension has no access to your browsing history. |'
  );
  lines.push(
    '| `scripting` | Required to run the read-only collector in the page and read what it needs. |'
  );
  lines.push('');
  lines.push(
    'That is the complete list. There is no background service worker, no `storage`, no `tabs` permission and no host permissions.'
  );
  lines.push('');

  lines.push('## Privacy');
  lines.push('');
  lines.push(
    'The extension reads the page you explicitly ask it to inspect, keeps the result in the popup\'s memory, and forgets it when the popup closes. Nothing is written to disk unless *you* click an export button, and nothing is ever transmitted.'
  );
  lines.push('');

  lines.push('## Pages that cannot be inspected');
  lines.push('');
  lines.push(
    'Chrome forbids extensions from running on some pages, and the popup explains which case you have hit instead of failing silently:'
  );
  lines.push('');
  lines.push('- `chrome://`, `about:`, `devtools://`, `view-source:` and other browser pages');
  lines.push('- The Chrome Web Store');
  lines.push(
    '- `file://` URLs, unless you enable *Allow access to file URLs* on the extension\'s details page'
  );
  lines.push('');

  lines.push('## Development');
  lines.push('');
  lines.push(
    'This extension is part of a suite. Tests, shared code and tooling live at the repository root:'
  );
  lines.push('');
  lines.push('```bash');
  lines.push('npm test');
  lines.push('```');
  lines.push('');
  lines.push(
    'Files under `src/shared/` and `src/popup/base.css` are generated from the repository\'s `shared/` folder. Edit the source there and run `npm run sync`, never the copies.'
  );
  lines.push('');
  lines.push('See the root [README](../../README.md) for the full picture.');
  lines.push('');

  lines.push('## Licence');
  lines.push('');
  lines.push('MIT.');

  return lines.join('\n') + '\n';
}

let written = 0;
for (const extension of EXTENSIONS) {
  const dir = join(ROOT, 'extensions', extension.slug);
  if (!existsSync(dir)) continue;

  writeFileSync(join(dir, 'README.md'), readmeFor(extension));
  written++;
}

console.log('Wrote ' + written + ' extension READMEs.');
