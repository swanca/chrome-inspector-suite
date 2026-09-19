/**
 * Table collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript(). It must therefore
 * be entirely self-contained: no imports, no references to module scope.
 *
 * It reads cells verbatim, span attributes included. Turning spans into a
 * rectangular grid is done by src/lib/table.js, where it can be tested.
 *
 * @returns {object}
 */
export function collectTables() {
  const MAX_TABLES = 50;
  const MAX_ROWS = 2000;
  const MAX_TEXT = 500;

  const clip = (value) => {
    const trimmed = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) + '…' : trimmed;
  };

  const tables = document.querySelectorAll('table');
  const collected = [];

  for (let index = 0; index < tables.length && collected.length < MAX_TABLES; index++) {
    const table = tables[index];

    const rows = [];
    // HTMLTableElement.rows lists only this table's own rows, so a nested table
    // does not leak its rows into its parent here.
    for (let r = 0; r < table.rows.length && rows.length < MAX_ROWS; r++) {
      const cells = [];
      for (const cell of table.rows[r].cells) {
        // innerText is empty for hidden tables; textContent still has the data.
        const text = cell.innerText && cell.innerText.trim() ? cell.innerText : cell.textContent;
        cells.push({
          text: clip(text),
          // rowSpan is 0 when the author wrote rowspan="0", meaning "to the end
          // of the section". That is preserved and resolved by the grid builder.
          colspan: cell.colSpan,
          rowspan: cell.rowSpan,
          header: cell.tagName === 'TH',
        });
      }
      rows.push(cells);
    }

    const firstRow = rows[0] || [];

    collected.push({
      index,
      caption: table.caption ? clip(table.caption.textContent) : '',
      id: table.id || '',
      nested: Boolean(table.parentElement && table.parentElement.closest('table')),
      rowCount: table.rows.length,
      truncated: table.rows.length > MAX_ROWS,
      headings: firstRow.filter((cell) => cell.header).map((cell) => cell.text),
      preview: firstRow.map((cell) => cell.text).slice(0, 4),
      rows,
    });
  }

  return {
    url: location.href,
    title: document.title || '',
    count: tables.length,
    truncated: tables.length > MAX_TABLES,
    tables: collected,
    collectedAt: new Date().toISOString(),
  };
}
