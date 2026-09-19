/**
 * Placeholder icon generator.
 *
 * Draws each extension's mark straight to PNG using only Node built-ins, so the
 * repository carries no binary blobs it cannot regenerate and no image
 * dependency. Shapes are signed distance fields, supersampled for clean edges.
 *
 * These are placeholders. To ship a designed logo instead, drop
 * icon16/32/48/128.png into that extension's icons/ folder - nothing else
 * references the generator at runtime.
 *
 * Usage:
 *   node tools/make-icons.mjs            # every extension
 *   node tools/make-icons.mjs link-extractor
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS } from './extensions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;
const FOREGROUND = [255, 255, 255];

// --- PNG encoding ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));

  return Buffer.concat([length, typed, crc]);
}

/** Encodes raw RGBA bytes as a non-interlaced 8-bit PNG. */
function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Signed distance primitives (all in 0..1 space) --------------------------

const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

const ring = (x, y, cx, cy, r, t) => Math.abs(Math.hypot(x - cx, y - cy) - r) - t / 2;

function roundBox(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const boxOutline = (x, y, cx, cy, hw, hh, r, t) =>
  Math.abs(roundBox(x, y, cx, cy, hw, hh, r)) - t / 2;

function segment(x, y, ax, ay, bx, by, t) {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - t / 2;
}

const union = (...distances) => Math.min(...distances);

// --- Glyphs ------------------------------------------------------------------

const GLYPHS = {
  magnifier: (x, y) =>
    union(
      ring(x, y, 0.44, 0.42, 0.2, 0.075),
      segment(x, y, 0.585, 0.565, 0.76, 0.74, 0.085)
    ),

  target: (x, y) =>
    union(
      ring(x, y, 0.5, 0.5, 0.3, 0.07),
      ring(x, y, 0.5, 0.5, 0.17, 0.07),
      circle(x, y, 0.5, 0.5, 0.06)
    ),

  bag: (x, y) =>
    union(
      boxOutline(x, y, 0.5, 0.6, 0.25, 0.21, 0.06, 0.075),
      // Handle: the top half of a ring, clipped below its centre.
      Math.max(ring(x, y, 0.5, 0.39, 0.13, 0.07), y - 0.39)
    ),

  graph: (x, y) =>
    union(
      segment(x, y, 0.5, 0.28, 0.29, 0.7, 0.05),
      segment(x, y, 0.5, 0.28, 0.71, 0.7, 0.05),
      circle(x, y, 0.5, 0.26, 0.105),
      circle(x, y, 0.28, 0.72, 0.105),
      circle(x, y, 0.72, 0.72, 0.105)
    ),

  picture: (x, y) =>
    union(
      boxOutline(x, y, 0.5, 0.5, 0.29, 0.23, 0.05, 0.065),
      circle(x, y, 0.37, 0.41, 0.05),
      segment(x, y, 0.29, 0.68, 0.46, 0.51, 0.055),
      segment(x, y, 0.46, 0.51, 0.66, 0.7, 0.055)
    ),

  layers: (x, y) =>
    union(
      roundBox(x, y, 0.5, 0.31, 0.27, 0.05, 0.035),
      roundBox(x, y, 0.5, 0.5, 0.27, 0.05, 0.035),
      roundBox(x, y, 0.5, 0.69, 0.27, 0.05, 0.035)
    ),

  chain: (x, y) =>
    union(ring(x, y, 0.38, 0.62, 0.16, 0.075), ring(x, y, 0.62, 0.38, 0.16, 0.075)),

  document: (x, y) =>
    union(
      boxOutline(x, y, 0.5, 0.5, 0.23, 0.3, 0.045, 0.06),
      segment(x, y, 0.5, 0.35, 0.5, 0.62, 0.06),
      segment(x, y, 0.38, 0.51, 0.5, 0.635, 0.06),
      segment(x, y, 0.62, 0.51, 0.5, 0.635, 0.06)
    ),

  grid: (x, y) =>
    union(
      boxOutline(x, y, 0.5, 0.5, 0.29, 0.25, 0.045, 0.06),
      segment(x, y, 0.21, 0.42, 0.79, 0.42, 0.05),
      segment(x, y, 0.5, 0.25, 0.5, 0.75, 0.05)
    ),

  chip: (x, y) => {
    const pins = [];
    for (const offset of [0.34, 0.5, 0.66]) {
      pins.push(segment(x, y, 0.15, offset, 0.26, offset, 0.05));
      pins.push(segment(x, y, 0.74, offset, 0.85, offset, 0.05));
      pins.push(segment(x, y, offset, 0.15, offset, 0.26, 0.05));
      pins.push(segment(x, y, offset, 0.74, offset, 0.85, 0.05));
    }
    return union(
      // Square outline with a filled core, so it reads as a chip, not a box.
      boxOutline(x, y, 0.5, 0.5, 0.24, 0.24, 0.045, 0.07),
      roundBox(x, y, 0.5, 0.5, 0.085, 0.085, 0.02),
      ...pins
    );
  },
};

// --- Rendering ---------------------------------------------------------------

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * A diagonal gradient: a lighter tint of the accent at the top left, the accent
 * itself at the bottom right. Enough depth that the mark does not read as a flat
 * swatch, without becoming noisy at 16px.
 */
function gradientAt(x, y, base) {
  const t = Math.min(1, Math.max(0, (x + y) / 2));
  return base.map((channel) => {
    const light = channel + (255 - channel) * 0.38;
    return Math.round(light + (channel - light) * t);
  });
}

/** Renders one icon, averaging SUPERSAMPLE^2 samples per pixel for smooth edges. */
function renderIcon(size, glyph, background) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px * SUPERSAMPLE + sx + 0.5) * step;
          const y = (py * SUPERSAMPLE + sy + 0.5) * step;

          let colour = null;
          if (glyph(x, y) < 0) colour = FOREGROUND;
          else if (roundBox(x, y, 0.5, 0.5, 0.46, 0.46, 0.14) < 0) {
            colour = gradientAt(x, y, background);
          }

          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          hits++;
        }
      }

      if (hits === 0) continue;

      const offset = (py * size + px) * 4;
      rgba[offset] = Math.round(r / hits);
      rgba[offset + 1] = Math.round(g / hits);
      rgba[offset + 2] = Math.round(b / hits);
      rgba[offset + 3] = Math.round((hits / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
    }
  }

  return encodePng(size, rgba);
}

// --- Entry point -------------------------------------------------------------

const only = process.argv[2];
const targets = only ? EXTENSIONS.filter((e) => e.slug === only) : EXTENSIONS;

if (!targets.length) {
  console.error('No extension matches "' + only + '".');
  process.exit(1);
}

for (const extension of targets) {
  const glyph = GLYPHS[extension.glyph];
  if (!glyph) throw new Error('Unknown glyph "' + extension.glyph + '" for ' + extension.slug);

  const outputDir = join(ROOT, 'extensions', extension.slug, 'icons');
  mkdirSync(outputDir, { recursive: true });

  const background = hexToRgb(extension.accent);
  const written = [];
  for (const size of SIZES) {
    const png = renderIcon(size, glyph, background);
    writeFileSync(join(outputDir, 'icon' + size + '.png'), png);
    written.push(size + 'px ' + png.length + 'B');
  }

  console.log(extension.slug.padEnd(26) + extension.accent + '  ' + written.join('  '));
}

console.log('\nGenerated icons for ' + targets.length + ' extension(s).');
