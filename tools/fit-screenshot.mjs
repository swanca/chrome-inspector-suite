/**
 * Turns any screenshot into a Chrome Web Store image.
 *
 * The store accepts 1280x800 or 640x400 and nothing else. Anything the wrong
 * size is either rejected or silently letterboxed by the store, badly. Take the
 * screenshot however you like; this scales it to fit and centres it on a
 * background, so the result is exactly the right size with nothing cropped off.
 *
 * Usage:
 *   node tools/fit-screenshot.mjs shopify-store-inspector ~/Desktop/shot1.png
 *   node tools/fit-screenshot.mjs shopify-store-inspector shot1.png --small
 *
 * Output goes to store-assets/<slug>/, numbered in the order you add them.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng, resize, encodePng } from './png.mjs';
import { EXTENSIONS } from './extensions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const LARGE = { width: 1280, height: 800 };
const SMALL = { width: 640, height: 400 };

/** Breathing room around the screenshot, as a share of the canvas. */
const MARGIN = 0.05;

function hexToRgb(hex) {
  const value = String(hex).replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** Mixes a colour towards black, so the accent reads as a backdrop not a flag. */
function darken(rgb, amount) {
  return rgb.map((channel) => Math.round(channel * (1 - amount)));
}

/**
 * Scales `image` to fit inside the canvas and centres it on a solid ground.
 *
 * Fit, never fill: a store screenshot that has had its edges cropped off is
 * worse than one with a margin.
 */
function fit(image, canvas, background) {
  const usableWidth = Math.round(canvas.width * (1 - MARGIN * 2));
  const usableHeight = Math.round(canvas.height * (1 - MARGIN * 2));

  const scale = Math.min(usableWidth / image.width, usableHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const scaled = resize(image.rgba, image.width, image.height, width, height);

  const out = Buffer.alloc(canvas.width * canvas.height * 4);
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    out[i * 4] = background[0];
    out[i * 4 + 1] = background[1];
    out[i * 4 + 2] = background[2];
    out[i * 4 + 3] = 255;
  }

  const left = Math.round((canvas.width - width) / 2);
  const top = Math.round((canvas.height - height) / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = ((top + y) * canvas.width + (left + x)) * 4;

      // Compose over the ground, so a screenshot with rounded corners or a
      // transparent shadow does not leave black fringes.
      const alpha = scaled[from + 3] / 255;
      for (let c = 0; c < 3; c++) {
        out[to + c] = Math.round(scaled[from + c] * alpha + background[c] * (1 - alpha));
      }
      out[to + 3] = 255;
    }
  }

  return { width: canvas.width, height: canvas.height, rgba: out, scale };
}

// --- Entry point -------------------------------------------------------------

const slug = process.argv[2];
const sourcePath = process.argv[3];
const canvas = process.argv.includes('--small') ? SMALL : LARGE;

if (!slug || !sourcePath) {
  console.error('Usage: node tools/fit-screenshot.mjs <extension-slug> <screenshot.png> [--small]\n');
  console.error('Extensions:');
  for (const extension of EXTENSIONS) console.error('  ' + extension.slug);
  process.exit(1);
}

const extension = EXTENSIONS.find((entry) => entry.slug === slug);
if (!extension) {
  console.error('Unknown extension "' + slug + '".');
  process.exit(1);
}

if (!existsSync(sourcePath)) {
  console.error('No such file: ' + sourcePath);
  process.exit(1);
}

let image;
try {
  image = decodePng(readFileSync(sourcePath));
} catch (error) {
  console.error('Could not read that image: ' + error.message);
  console.error('It has to be a PNG. Re-save it as one - any image viewer will do it.');
  process.exit(1);
}

const outputDir = join(ROOT, 'store-assets', slug);
mkdirSync(outputDir, { recursive: true });

const existing = existsSync(outputDir)
  ? readdirSync(outputDir).filter((name) => /^\d+-/.test(name)).length
  : 0;

const background = darken(hexToRgb(extension.accent), 0.72);
const fitted = fit(image, canvas, background);

const name = String(existing + 1).padStart(2, '0') + '-' + basename(sourcePath).replace(/\.[^.]+$/, '') + '.png';
const path = join(outputDir, name);
writeFileSync(path, encodePng(fitted.width, fitted.height, fitted.rgba));

console.log('  in   ' + image.width + 'x' + image.height);
console.log('  out  ' + canvas.width + 'x' + canvas.height + '  (scaled ' + Math.round(fitted.scale * 100) + '%)');
console.log('');
console.log('Written to store-assets/' + slug + '/' + name);

if (fitted.scale < 0.5) {
  console.log('');
  console.log('Note: that was scaled below half size, so it will look soft. Capture a');
  console.log('smaller region - the popup plus some of the page, not the whole desktop.');
}
