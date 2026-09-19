/**
 * Turns collected table cells into a rectangular grid.
 *
 * Pure functions: cell records in, a grid out. No DOM, no chrome.* APIs - which
 * is what makes this file directly unit-testable under Node.
 *
 * Spans are the whole problem here. A cell with colspan="2" occupies two
 * columns; one with rowspan="3" occupies the same column in the next two rows,
 * pushing later cells to the right. Getting this wrong silently misaligns every
 * column after it, which is exactly the kind of bug a CSV export must not have.
 */

/** A span is clamped to this, so a hostile rowspan="99999" cannot hang the popup. */
const MAX_SPAN = 1000;

/**
 * Expands cells with colspan/rowspan into a rectangular grid of strings.
 *
 * @param {Array<Array<{text: string, colspan?: number, rowspan?: number}>>} rows
 * @returns {Array<Array<string>>} Every row padded to the same width.
 * @throws {TypeError} If rows is not an array.
 */
export function expandGrid(rows) {
  if (!Array.isArray(rows)) throw new TypeError('expandGrid() requires an array of rows.');

  const grid = [];
  const rowCount = rows.length;

  const ensureRow = (index) => {
    while (grid.length <= index) grid.push([]);
  };

  for (let r = 0; r < rowCount; r++) {
    ensureRow(r);

    let column = 0;
    for (const cell of rows[r] || []) {
      // Skip columns already claimed by a rowspan from an earlier row.
      while (grid[r][column] !== undefined) column++;

      const colspan = resolveSpan(cell && cell.colspan, 1, MAX_SPAN);

      // rowspan="0" means "to the end of the section".
      const requested = cell && cell.rowspan;
      const rowspan =
        Number(requested) === 0
          ? rowCount - r
          : Math.min(resolveSpan(requested, 1, MAX_SPAN), rowCount - r);

      const text = cell && cell.text !== undefined && cell.text !== null ? String(cell.text) : '';

      for (let dr = 0; dr < rowspan; dr++) {
        ensureRow(r + dr);
        for (let dc = 0; dc < colspan; dc++) {
          grid[r + dr][column + dc] = text;
        }
      }

      column += colspan;
    }
  }

  const width = grid.reduce((widest, row) => Math.max(widest, row.length), 0);

  return grid.map((row) => {
    const padded = new Array(width);
    for (let c = 0; c < width; c++) padded[c] = row[c] === undefined ? '' : row[c];
    return padded;
  });
}

function resolveSpan(value, fallback, max) {
  const span = Number(value);
  if (!Number.isFinite(span) || span < 1) return fallback;
  return Math.min(Math.floor(span), max);
}

/**
 * A short human label for the table picker.
 *
 * @param {object} table One entry of collectTables().tables
 * @returns {string}
 */
export function describeTable(table) {
  if (!table) return 'Table';

  const parts = ['Table ' + ((Number(table.index) || 0) + 1)];

  if (table.caption) parts.push(table.caption);
  else if (table.headings && table.headings.length) parts.push(table.headings.slice(0, 3).join(' / '));
  else if (table.preview && table.preview.length) parts.push(table.preview.filter(Boolean).slice(0, 3).join(' / '));

  const label = parts.join(' - ');
  return label.length > 70 ? label.slice(0, 70) + '…' : label;
}

/**
 * Grid dimensions, for the header pills.
 * @param {Array<Array<string>>} grid
 * @returns {{rows: number, columns: number, cells: number, empty: number}}
 */
export function measureGrid(grid) {
  if (!Array.isArray(grid) || !grid.length) return { rows: 0, columns: 0, cells: 0, empty: 0 };

  const columns = grid[0].length;
  let empty = 0;
  for (const row of grid) {
    for (const cell of row) if (!String(cell).trim()) empty++;
  }

  return { rows: grid.length, columns, cells: grid.length * columns, empty };
}

/**
 * Drops rows and columns that are entirely empty, which spacer markup produces
 * in abundance on layout tables.
 *
 * @param {Array<Array<string>>} grid
 * @returns {Array<Array<string>>}
 */
export function trimGrid(grid) {
  if (!Array.isArray(grid) || !grid.length) return [];

  const rows = grid.filter((row) => row.some((cell) => String(cell).trim() !== ''));
  if (!rows.length) return [];

  const width = rows[0].length;
  const keep = [];
  for (let c = 0; c < width; c++) {
    if (rows.some((row) => String(row[c] === undefined ? '' : row[c]).trim() !== '')) keep.push(c);
  }

  return rows.map((row) => keep.map((c) => (row[c] === undefined ? '' : row[c])));
}
