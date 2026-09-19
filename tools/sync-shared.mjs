/**
 * Copies shared/ into every extension.
 *
 * Each extension must be loadable on its own with "Load unpacked", so it cannot
 * import code from outside its own folder. The single source of truth therefore
 * lives in shared/ and is copied in, rather than referenced.
 *
 * Usage:
 *   node tools/sync-shared.mjs          # write the copies
 *   node tools/sync-shared.mjs --check  # fail if any copy is stale (used by npm test)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS } from './extensions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

/** source in shared/  ->  destination inside each extension */
const FILES = [
  ['page.js', join('src', 'shared', 'page.js')],
  ['ui.js', join('src', 'shared', 'ui.js')],
  ['output.js', join('src', 'shared', 'output.js')],
  ['entitlements.js', join('src', 'shared', 'entitlements.js')],
  ['license-ui.js', join('src', 'shared', 'license-ui.js')],
  ['license-key.js', join('src', 'shared', 'license-key.js')],
  ['popup.css', join('src', 'popup', 'base.css')],
];

const BANNER =
  'GENERATED FILE - do not edit.\n' +
  ' * Source: shared/%SOURCE%\n' +
  ' * Run `npm run sync` after changing the source.';

/** Prepends the "do not edit" banner to the copied file's own header comment. */
function withBanner(contents, source) {
  const banner = BANNER.replace('%SOURCE%', source);
  if (contents.startsWith('/**')) {
    return contents.replace('/**\n', '/**\n * ' + banner + '\n *\n');
  }
  return '/**\n * ' + banner + '\n */\n\n' + contents;
}

let stale = 0;
let written = 0;

for (const extension of EXTENSIONS) {
  const extensionDir = join(ROOT, 'extensions', extension.slug);
  if (!existsSync(extensionDir)) continue;

  for (const [source, destination] of FILES) {
    const expected = withBanner(readFileSync(join(ROOT, 'shared', source), 'utf8'), source);
    const target = join(extensionDir, destination);

    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === expected) continue;

    if (CHECK_ONLY) {
      console.error('STALE  ' + join('extensions', extension.slug, destination));
      stale++;
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, expected);
    written++;
  }
}

if (CHECK_ONLY) {
  if (stale) {
    console.error('\n' + stale + ' shared file(s) out of date. Run: npm run sync');
    process.exit(1);
  }
  console.log('Shared code is in sync across every extension.');
} else {
  console.log('Synced shared code: ' + written + ' file(s) written.');
}
