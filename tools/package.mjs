/**
 * Builds the upload-ready zip for every extension.
 *
 * Only manifest.json, icons/ and src/ go in. Tests, READMEs and the listing
 * notes are development artefacts: shipping them does nothing but enlarge the
 * package and give the reviewer more to read.
 *
 * The zip writer is here rather than a dependency, for the same reason nothing
 * else in this repository has one - `npm install` should never stand between
 * you and a release.
 *
 * Usage:
 *   node tools/package.mjs                # all ten, into dist/
 *   node tools/package.mjs link-extractor # just one
 */

import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS, VERSION } from './extensions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Only these ship. Anything else in the folder is left behind. */
const INCLUDE = ['manifest.json', 'icons', 'src'];

// --- ZIP ---------------------------------------------------------------------

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

/** MS-DOS date and time, which is what the ZIP format stores. */
function dosStamp(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * @param {Array<{name: string, data: Buffer}>} files Paths use forward slashes.
 * @returns {Buffer}
 */
function zip(files, now = new Date()) {
  const { time, day } = dosStamp(now);
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.data, { level: 9 });
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(day, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30); // extra
    entry.writeUInt16LE(0, 32); // comment
    entry.writeUInt16LE(0, 34); // disk
    entry.writeUInt16LE(0, 36); // internal attrs
    entry.writeUInt32LE(0, 38); // external attrs
    entry.writeUInt32LE(offset, 42);

    central.push(entry, name);
    offset += local.length + name.length + compressed.length;
  }

  const directory = Buffer.concat(central);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, directory, end]);
}

// --- Collecting --------------------------------------------------------------

function collect(base, current, files) {
  for (const name of readdirSync(current).sort()) {
    const full = join(current, name);
    if (statSync(full).isDirectory()) collect(base, full, files);
    else {
      files.push({
        // ZIP entries always use forward slashes, whatever the platform.
        name: relative(base, full).split(sep).join('/'),
        data: readFileSync(full),
      });
    }
  }
  return files;
}

// --- Entry point -------------------------------------------------------------

const only = process.argv[2];
const targets = only ? EXTENSIONS.filter((e) => e.slug === only) : EXTENSIONS;

if (!targets.length) {
  console.error('No extension matches "' + only + '".');
  process.exit(1);
}

if (!only && existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

let failures = 0;

for (const extension of targets) {
  const dir = join(ROOT, 'extensions', extension.slug);
  const files = [];

  for (const entry of INCLUDE) {
    const full = join(dir, entry);
    if (!existsSync(full)) {
      console.error('  MISSING  ' + extension.slug + '/' + entry);
      failures++;
      continue;
    }
    if (statSync(full).isDirectory()) collect(dir, full, files);
    else files.push({ name: entry, data: readFileSync(full) });
  }

  const manifest = files.find((file) => file.name === 'manifest.json');
  const version = manifest ? JSON.parse(manifest.data.toString('utf8')).version : VERSION;

  const archive = zip(files);
  const path = join(DIST, extension.slug + '-' + version + '.zip');
  writeFileSync(path, archive);

  console.log(
    '  ' + extension.slug.padEnd(26) +
      String(files.length).padStart(3) + ' files  ' +
      (archive.length / 1024).toFixed(1).padStart(6) + ' KB'
  );
}

console.log('');
if (failures) {
  console.log(failures + ' problem(s). Nothing was skipped silently.');
  process.exit(1);
}
console.log('Packaged ' + targets.length + ' extension(s) into dist/');
console.log('Upload each zip at https://chrome.google.com/webstore/devconsole');
