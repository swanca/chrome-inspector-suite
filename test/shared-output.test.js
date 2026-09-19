import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exportFilename, escapeCsvField, toCsv } from '../shared/output.js';

// --- exportFilename ----------------------------------------------------------

const AT = new Date('2026-09-19T12:34:56Z');

test('exportFilename combines slug, host and date', () => {
  assert.equal(
    exportFilename('link-extractor', 'https://www.example.com/deep/path?q=1', 'csv', AT),
    'link-extractor-www-example-com-2026-09-19.csv'
  );
});

test('exportFilename falls back instead of throwing on a bad URL', () => {
  assert.equal(exportFilename('seo', 'not a url', 'json', AT), 'seo-page-2026-09-19.json');
  assert.equal(exportFilename('seo', undefined, 'json', AT), 'seo-page-2026-09-19.json');
});

test('exportFilename strips characters that are illegal in filenames', () => {
  const name = exportFilename('a/b:c', 'https://ex.com', 'cs*v', AT);
  assert.equal(/[\\/:*?"<>|]/.test(name), false);
  assert.ok(name.endsWith('.csv'));
});

test('exportFilename never produces an empty segment', () => {
  const name = exportFilename('!!!', 'https://!!!.com', '!!!', AT);
  assert.ok(name.startsWith('export-'));
  assert.ok(name.endsWith('.txt'));
});

// --- escapeCsvField ----------------------------------------------------------

test('escapeCsvField leaves plain values untouched', () => {
  assert.equal(escapeCsvField('hello'), 'hello');
  assert.equal(escapeCsvField(42), '42');
  assert.equal(escapeCsvField(null), '');
  assert.equal(escapeCsvField(undefined), '');
});

test('escapeCsvField quotes delimiters, quotes and newlines', () => {
  assert.equal(escapeCsvField('a,b'), '"a,b"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeCsvField(' padded '), '" padded "');
});

test('escapeCsvField only quotes the delimiter actually in use', () => {
  assert.equal(escapeCsvField('a,b', ';'), 'a,b');
  assert.equal(escapeCsvField('a;b', ';'), '"a;b"');
});

test('escapeCsvField neutralises spreadsheet formula injection', () => {
  // These values come from an untrusted page; Excel would otherwise run them.
  assert.equal(escapeCsvField('=1+1'), "'=1+1");
  assert.equal(escapeCsvField('+SUM(A1)'), "'+SUM(A1)");
  assert.equal(escapeCsvField('-2+3'), "'-2+3");
  assert.equal(escapeCsvField('@import'), "'@import");
});

test('escapeCsvField still quotes an injected field that also needs quoting', () => {
  assert.equal(escapeCsvField('=a,b'), '"\'=a,b"');
});

test('escapeCsvField does not mangle an ordinary negative number in text', () => {
  // Prefixing is deliberate and lossless: the apostrophe is stripped by the
  // spreadsheet on import, and the value stays readable in a text editor.
  assert.equal(escapeCsvField('-5'), "'-5");
});

// --- toCsv -------------------------------------------------------------------

test('toCsv renders a grid with CRLF line endings', () => {
  const csv = toCsv([['a', 'b'], [1, 2]], { bom: false });
  assert.equal(csv, 'a,b\r\n1,2');
});

test('toCsv prepends a BOM by default so Excel reads accents correctly', () => {
  assert.ok(toCsv([['café']]).startsWith('﻿'));
  assert.equal(toCsv([['café']], { bom: false }).startsWith('﻿'), false);
});

test('toCsv honours an alternative delimiter', () => {
  assert.equal(toCsv([['a', 'b']], { delimiter: ';', bom: false }), 'a;b');
  assert.equal(toCsv([['a', 'b']], { delimiter: '\t', bom: false }), 'a\tb');
});

test('toCsv accepts an empty grid and scalar rows', () => {
  assert.equal(toCsv([], { bom: false }), '');
  assert.equal(toCsv(['solo'], { bom: false }), 'solo');
});

test('toCsv rejects a non-array', () => {
  assert.throws(() => toCsv('nope'), TypeError);
  assert.throws(() => toCsv(null), TypeError);
});

test('toCsv output round-trips through a minimal RFC 4180 parser', () => {
  const rows = [
    ['name', 'note'],
    ['a,b', 'say "hi"'],
    ['multi\nline', ' padded '],
  ];
  assert.deepEqual(parseCsv(toCsv(rows, { bom: false })), rows);
});

/** A deliberately small RFC 4180 reader, used only to verify our writer. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows;
}
