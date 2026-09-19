import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expandGrid, describeTable, measureGrid, trimGrid } from '../src/lib/table.js';

/** Terse cell builder: cell('A'), cell('A', 2), cell('A', 1, 3). */
const cell = (text, colspan = 1, rowspan = 1) => ({ text, colspan, rowspan });

// --- The simple case ---------------------------------------------------------

test('a plain grid comes back unchanged', () => {
  const grid = expandGrid([
    [cell('a'), cell('b')],
    [cell('c'), cell('d')],
  ]);
  assert.deepEqual(grid, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('an empty table yields an empty grid', () => {
  assert.deepEqual(expandGrid([]), []);
});

test('expandGrid rejects a non-array', () => {
  assert.throws(() => expandGrid(null), TypeError);
  assert.throws(() => expandGrid('nope'), TypeError);
});

// --- colspan -----------------------------------------------------------------

test('colspan repeats the value across the columns it covers', () => {
  const grid = expandGrid([
    [cell('wide', 2), cell('c')],
    [cell('a'), cell('b'), cell('c')],
  ]);
  assert.deepEqual(grid, [
    ['wide', 'wide', 'c'],
    ['a', 'b', 'c'],
  ]);
});

// --- rowspan -----------------------------------------------------------------

test('rowspan pushes later cells in following rows to the right', () => {
  // This is the alignment bug a naive implementation produces: without
  // occupancy tracking, "b2" would land in column 0 of row 2.
  const grid = expandGrid([
    [cell('tall', 1, 2), cell('b1')],
    [cell('b2')],
  ]);
  assert.deepEqual(grid, [
    ['tall', 'b1'],
    ['tall', 'b2'],
  ]);
});

test('a rowspan in the middle of a row is honoured', () => {
  const grid = expandGrid([
    [cell('a1'), cell('tall', 1, 2), cell('c1')],
    [cell('a2'), cell('c2')],
  ]);
  assert.deepEqual(grid, [
    ['a1', 'tall', 'c1'],
    ['a2', 'tall', 'c2'],
  ]);
});

test('colspan and rowspan combine into a rectangle', () => {
  const grid = expandGrid([
    [cell('block', 2, 2), cell('c1')],
    [cell('c2')],
    [cell('a3'), cell('b3'), cell('c3')],
  ]);
  assert.deepEqual(grid, [
    ['block', 'block', 'c1'],
    ['block', 'block', 'c2'],
    ['a3', 'b3', 'c3'],
  ]);
});

test('rowspan is clipped to the table instead of inventing phantom rows', () => {
  const grid = expandGrid([
    [cell('a'), cell('b')],
    [cell('c', 1, 5), cell('d')],
  ]);
  assert.equal(grid.length, 2);
  assert.deepEqual(grid[1], ['c', 'd']);
});

test('rowspan="0" runs to the end of the table', () => {
  const grid = expandGrid([
    [cell('spans all', 1, 0), cell('b1')],
    [cell('b2')],
    [cell('b3')],
  ]);
  assert.deepEqual(grid, [
    ['spans all', 'b1'],
    ['spans all', 'b2'],
    ['spans all', 'b3'],
  ]);
});

// --- Ragged and hostile input ------------------------------------------------

test('ragged rows are padded to a rectangle', () => {
  const grid = expandGrid([
    [cell('a'), cell('b'), cell('c')],
    [cell('d')],
  ]);
  assert.deepEqual(grid, [
    ['a', 'b', 'c'],
    ['d', '', ''],
  ]);
});

test('every row has identical width, which CSV depends on', () => {
  const grid = expandGrid([
    [cell('a', 3)],
    [cell('b'), cell('c')],
    [cell('d', 1, 2)],
    [],
  ]);
  const widths = new Set(grid.map((row) => row.length));
  assert.equal(widths.size, 1);
});

test('absurd spans are clamped rather than hanging the popup', () => {
  const grid = expandGrid([[cell('x', 99999, 99999)]]);
  assert.equal(grid.length, 1);
  assert.ok(grid[0].length <= 1000);
});

test('missing, zero and negative colspans fall back to one column', () => {
  const grid = expandGrid([
    [{ text: 'a' }, { text: 'b', colspan: 0 }, { text: 'c', colspan: -3 }],
  ]);
  assert.deepEqual(grid, [['a', 'b', 'c']]);
});

test('missing and null cell text becomes an empty string, never "null"', () => {
  const grid = expandGrid([[{ text: null }, { text: undefined }, {}]]);
  assert.deepEqual(grid, [['', '', '']]);
});

test('a row of undefined is tolerated', () => {
  const grid = expandGrid([[cell('a')], undefined, [cell('b')]]);
  assert.equal(grid.length, 3);
  assert.deepEqual(grid[1], ['']);
});

// --- measureGrid -------------------------------------------------------------

test('measureGrid reports dimensions and empty cells', () => {
  const measured = measureGrid([
    ['a', ''],
    ['c', 'd'],
  ]);
  assert.deepEqual(measured, { rows: 2, columns: 2, cells: 4, empty: 1 });
});

test('measureGrid handles an empty grid', () => {
  assert.deepEqual(measureGrid([]), { rows: 0, columns: 0, cells: 0, empty: 0 });
  assert.deepEqual(measureGrid(null), { rows: 0, columns: 0, cells: 0, empty: 0 });
});

// --- trimGrid ----------------------------------------------------------------

test('trimGrid drops fully empty rows and columns', () => {
  const grid = [
    ['a', '', 'b'],
    ['', '', ''],
    ['c', '', 'd'],
  ];
  assert.deepEqual(trimGrid(grid), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('trimGrid keeps a column that has content in only one row', () => {
  const grid = [
    ['a', '', 'b'],
    ['c', 'x', 'd'],
  ];
  assert.deepEqual(trimGrid(grid), [
    ['a', '', 'b'],
    ['c', 'x', 'd'],
  ]);
});

test('trimGrid on an all-empty grid yields nothing', () => {
  assert.deepEqual(trimGrid([['', ''], ['', '']]), []);
  assert.deepEqual(trimGrid([]), []);
  assert.deepEqual(trimGrid(null), []);
});

test('trimGrid treats whitespace-only cells as empty', () => {
  assert.deepEqual(trimGrid([['a', '   '], ['b', '\t']]), [['a'], ['b']]);
});

// --- describeTable -----------------------------------------------------------

test('describeTable prefers the caption, then headings, then first-row text', () => {
  assert.equal(describeTable({ index: 0, caption: 'Sales' }), 'Table 1 - Sales');
  assert.equal(
    describeTable({ index: 1, caption: '', headings: ['Name', 'Price'] }),
    'Table 2 - Name / Price'
  );
  assert.equal(
    describeTable({ index: 2, caption: '', headings: [], preview: ['a', 'b'] }),
    'Table 3 - a / b'
  );
  assert.equal(describeTable({ index: 3, caption: '', headings: [], preview: [] }), 'Table 4');
});

test('describeTable truncates a very long label', () => {
  const label = describeTable({ index: 0, caption: 'x'.repeat(200) });
  assert.ok(label.length <= 71);
  assert.ok(label.endsWith('…'));
});

test('describeTable tolerates a missing table', () => {
  assert.equal(describeTable(null), 'Table');
});
