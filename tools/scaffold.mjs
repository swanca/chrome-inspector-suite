/**
 * Generates the per-extension boilerplate that is pure derivation of the
 * registry: manifest.json and the accent half of theme.css.
 *
 * Everything else in an extension - popup markup, collector, rules, tests - is
 * written by hand, because it is what makes each extension different.
 *
 * theme.css is only rewritten between its two generated markers, so bespoke
 * component styles added below them survive.
 *
 * Usage: node tools/scaffold.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS, VERSION } from './extensions.mjs';
import { LISTINGS } from './listings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const START = '/* --- generated: accent (tools/scaffold.mjs) --- */';
const END = '/* --- end generated --- */';

/** Mixes a colour towards white so the accent stays legible on a dark ground. */
function lighten(hex, amount) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (
    '#' +
    channels
      .map((c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0'))
      .join('')
  );
}

function manifestFor(extension) {
  if (extension.description.length > 132) {
    throw new Error(
      extension.slug + ': description is ' + extension.description.length + ' chars (max 132)'
    );
  }

  return (
    JSON.stringify(
      {
        manifest_version: 3,
        // The store-optimised name: its search weighs this most heavily. The
        // popup header uses its own short label, so the UI is unaffected.
        name: (LISTINGS[extension.slug] || {}).storeName || extension.name,
        version: extension.version || VERSION,
        description: extension.description,
        icons: {
          16: 'icons/icon16.png',
          32: 'icons/icon32.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png',
        },
        action: {
          default_title: extension.name,
          default_popup: 'src/popup/popup.html',
          default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' },
        },
        permissions: ['activeTab', 'scripting'],
      },
      null,
      2
    ) + '\n'
  );
}

function accentBlock(extension) {
  return [
    START,
    ':root {',
    '  --accent: ' + extension.accent + ';',
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    '    --accent: ' + lighten(extension.accent, 0.55) + ';',
    '  }',
    '}',
    END,
  ].join('\n');
}

let written = 0;

for (const extension of EXTENSIONS) {
  const dir = join(ROOT, 'extensions', extension.slug);
  mkdirSync(join(dir, 'src', 'popup'), { recursive: true });

  writeFileSync(join(dir, 'manifest.json'), manifestFor(extension));
  written++;

  const themePath = join(dir, 'src', 'popup', 'theme.css');
  const block = accentBlock(extension);

  if (existsSync(themePath)) {
    const current = readFileSync(themePath, 'utf8');
    const startAt = current.indexOf(START);
    const endAt = current.indexOf(END);

    if (startAt !== -1 && endAt !== -1) {
      writeFileSync(
        themePath,
        current.slice(0, startAt) + block + current.slice(endAt + END.length)
      );
    } else {
      // First run against a hand-written theme: put the block on top, keep the rest.
      writeFileSync(themePath, block + '\n\n' + current.trimStart());
    }
  } else {
    writeFileSync(
      themePath,
      '/* ' + extension.name + ' theme. Loaded after base.css so it wins. */\n\n' + block + '\n'
    );
  }
  written++;
}

console.log('Scaffolded ' + written + ' file(s) across ' + EXTENSIONS.length + ' extensions.');
