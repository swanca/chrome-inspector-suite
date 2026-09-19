/**
 * Turns one square PNG logo into the four icon sizes an extension needs.
 *
 * Use this for artwork made elsewhere - a designer, Figma, an image generator.
 * Save the image as PNG, then:
 *
 *   node tools/import-logo.mjs shopify-store-inspector ~/Downloads/logo.png
 *
 * It decodes, resizes with a box filter (which is what makes a downscale look
 * clean rather than aliased), and writes icon16/32/48/128.png in place.
 *
 * PNG only, and no dependency: the codec lives in tools/png.mjs. If your source
 * is WebP or JPEG, re-save it as PNG first - any image viewer will do it.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng, resize, encodePng } from './png.mjs';
import { EXTENSIONS } from './extensions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 128];

// --- Entry point -------------------------------------------------------------

const slug = process.argv[2];
const sourcePath = process.argv[3];

if (!slug || !sourcePath) {
  console.error('Usage: node tools/import-logo.mjs <extension-slug> <logo.png>\n');
  console.error('Extensions:');
  for (const extension of EXTENSIONS) console.error('  ' + extension.slug);
  process.exit(1);
}

if (!EXTENSIONS.some((extension) => extension.slug === slug)) {
  console.error('Unknown extension "' + slug + '".');
  process.exit(1);
}

if (!existsSync(sourcePath)) {
  console.error('No such file: ' + sourcePath);
  process.exit(1);
}

const decoded = decodePng(readFileSync(sourcePath));

if (decoded.width !== decoded.height) {
  console.warn(
    'Warning: the source is ' + decoded.width + 'x' + decoded.height +
      '. Icons are square, so this will be squashed. Crop it first for a better result.'
  );
}
if (decoded.width < 128) {
  console.warn('Warning: the source is only ' + decoded.width + 'px. 512px or more looks best.');
}

const outputDir = join(ROOT, 'extensions', slug, 'icons');
mkdirSync(outputDir, { recursive: true });

for (const size of SIZES) {
  const resized = resize(decoded.rgba, decoded.width, decoded.height, size, size);
  const png = encodePng(size, size, resized);
  writeFileSync(join(outputDir, 'icon' + size + '.png'), png);
  console.log('  icon' + String(size).padStart(3) + '.png  ' + String(png.length).padStart(6) + ' bytes');
}

console.log('\nImported ' + decoded.width + 'x' + decoded.height + ' logo into ' + slug + '.');
console.log('Reload the extension in chrome://extensions to see it.');
