/**
 * A small PNG codec, using only Node built-ins.
 *
 * Shared by the logo importer and the screenshot fitter. It exists so this
 * repository can decode, resize and re-encode images without an image
 * dependency - the same reason nothing else here has one.
 *
 * Scope: 8-bit PNGs, non-interlaced, colour types 0, 2, 3, 4 and 6. That covers
 * essentially everything a screenshot tool or a design tool will hand you.
 */

import { inflateSync, deflateSync } from 'node:zlib';

// --- Checksums and chunks ----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buffer) {
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

function readChunks(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== signature[i]) throw new Error('Not a PNG file.');
  }

  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

/** Undoes one scanline filter. See the PNG specification, section 9. */
function unfilter(type, line, previous, bytesPerPixel) {
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let i = 0; i < line.length; i++) {
    const a = i >= bytesPerPixel ? line[i - bytesPerPixel] : 0;
    const b = previous ? previous[i] : 0;
    const c = previous && i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;

    if (type === 1) line[i] = (line[i] + a) & 0xff;
    else if (type === 2) line[i] = (line[i] + b) & 0xff;
    else if (type === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
    else if (type === 4) line[i] = (line[i] + paeth(a, b, c)) & 0xff;
    else if (type !== 0) throw new Error('Unknown PNG filter type ' + type);
  }
  return line;
}

// --- Decoding ----------------------------------------------------------------

/**
 * @param {Buffer} buffer
 * @returns {{width: number, height: number, rgba: Buffer}}
 */
export function decodePng(buffer) {
  const chunks = readChunks(buffer);

  const ihdr = chunks.find((entry) => entry.type === 'IHDR');
  if (!ihdr) throw new Error('PNG has no header.');

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const depth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];

  if (depth !== 8) throw new Error('Only 8-bit PNGs are supported (this one is ' + depth + '-bit).');
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported. Re-save without Adam7.');

  const palette = chunks.find((entry) => entry.type === 'PLTE');
  const transparency = chunks.find((entry) => entry.type === 'tRNS');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('Unsupported PNG colour type ' + colorType + '.');

  const data = inflateSync(
    Buffer.concat(chunks.filter((entry) => entry.type === 'IDAT').map((entry) => entry.data))
  );

  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);

  let previous = null;
  let offset = 0;

  for (let y = 0; y < height; y++) {
    const filter = data[offset++];
    const line = Buffer.from(data.subarray(offset, offset + stride));
    offset += stride;

    unfilter(filter, line, previous, channels);
    previous = line;

    for (let x = 0; x < width; x++) {
      const source = x * channels;
      const target = (y * width + x) * 4;

      if (colorType === 6) {
        line.copy(rgba, target, source, source + 4);
      } else if (colorType === 2) {
        line.copy(rgba, target, source, source + 3);
        rgba[target + 3] = 255;
      } else if (colorType === 0) {
        rgba.fill(line[source], target, target + 3);
        rgba[target + 3] = 255;
      } else if (colorType === 4) {
        rgba.fill(line[source], target, target + 3);
        rgba[target + 3] = line[source + 1];
      } else {
        const index = line[source];
        if (!palette) throw new Error('Indexed PNG has no palette.');
        rgba[target] = palette.data[index * 3];
        rgba[target + 1] = palette.data[index * 3 + 1];
        rgba[target + 2] = palette.data[index * 3 + 2];
        rgba[target + 3] =
          transparency && index < transparency.data.length ? transparency.data[index] : 255;
      }
    }
  }

  return { width, height, rgba };
}

// --- Resizing ----------------------------------------------------------------

/**
 * Box filter: each output pixel averages every input pixel it covers.
 *
 * Alpha is premultiplied during the average, otherwise transparent pixels drag
 * their (usually black) colour into the edges of the result.
 *
 * @returns {Buffer} RGBA of size targetWidth x targetHeight.
 */
export function resize(source, width, height, targetWidth, targetHeight) {
  const out = Buffer.alloc(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y++) {
    const y0 = Math.floor((y * height) / targetHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / targetHeight));

    for (let x = 0; x < targetWidth; x++) {
      const x0 = Math.floor((x * width) / targetWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / targetWidth));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const index = (sy * width + sx) * 4;
          const alpha = source[index + 3] / 255;
          r += source[index] * alpha;
          g += source[index + 1] * alpha;
          b += source[index + 2] * alpha;
          a += source[index + 3];
          count++;
        }
      }

      const target = (y * targetWidth + x) * 4;
      const meanAlpha = a / count;
      const weight = meanAlpha / 255;

      out[target] = weight ? Math.round(r / count / weight) : 0;
      out[target + 1] = weight ? Math.round(g / count / weight) : 0;
      out[target + 2] = weight ? Math.round(b / count / weight) : 0;
      out[target + 3] = Math.round(meanAlpha);
    }
  }

  return out;
}

// --- Encoding ----------------------------------------------------------------

/**
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba
 * @returns {Buffer} A non-interlaced 8-bit RGBA PNG.
 */
export function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
