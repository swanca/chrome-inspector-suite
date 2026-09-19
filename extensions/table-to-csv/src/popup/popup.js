/**
 * Popup controller.
 *
 * Orchestration only: read the page's tables, hand the selected one to the pure
 * grid builder in src/lib/table.js, preview it, and wire the export controls.
 */

import { collectTables } from '../content/collect.js';
import { expandGrid, describeTable, measureGrid, trimGrid } from '../lib/table.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText, toCsv } from '../shared/output.js';

const SLUG = 'table-to-csv';

/** Rows rendered in the preview. The export always contains every row. */
const PREVIEW_ROWS = 40;

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  options: document.getElementById('options'),
  table: document.getElementById('table'),
  delimiter: document.getElementById('delimiter'),
  trim: document.getElementById('trim'),
  copy: document.getElementById('copy'),
  export: document.getElementById('export'),
  main: document.getElementById('main'),
  toast: document.getElementById('toast'),
};

const toast = createToast(elements.toast);

/** @type {{data: object}|null} */
let state = null;

function selectedTable() {
  if (!state) return null;
  const index = Number(elements.table.value);
  return state.data.tables.find((table) => table.index === index) || null;
}

/** The grid the user is currently looking at, and that the buttons will export. */
function currentGrid() {
  const table = selectedTable();
  if (!table) return [];

  const grid = expandGrid(table.rows);
  return elements.trim.checked ? trimGrid(grid) : grid;
}

// --- Rendering ---------------------------------------------------------------

function renderSummary(grid, table) {
  clear(elements.summary);

  const measured = measureGrid(grid);
  elements.summary.appendChild(pill('info', measured.rows + ' x ' + measured.columns));

  if (table && table.nested) elements.summary.appendChild(pill('warning', 'nested'));
  if (table && table.truncated) elements.summary.appendChild(pill('warning', 'truncated'));
}

function renderPreview(grid) {
  clear(elements.main);

  if (!grid.length) {
    showState(
      elements.main,
      'This table is empty.',
      elements.trim.checked ? 'Untick the option above to see its empty cells.' : undefined
    );
    return;
  }

  const scroller = el('div', 'scroller');
  const table = el('table', 'data-table');

  const head = el('thead');
  const headRow = el('tr');
  for (const heading of grid[0]) headRow.appendChild(el('th', null, heading));
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');
  for (const row of grid.slice(1, PREVIEW_ROWS + 1)) {
    const tr = el('tr');
    for (const value of row) tr.appendChild(el('td', null, value));
    body.appendChild(tr);
  }
  table.appendChild(body);

  scroller.appendChild(table);
  elements.main.appendChild(scroller);

  if (grid.length > PREVIEW_ROWS + 1) {
    elements.main.appendChild(
      el(
        'p',
        'state__hint',
        'Showing ' + PREVIEW_ROWS + ' of ' + (grid.length - 1) + ' data rows. The export has them all.'
      )
    );
  }
}

function render() {
  const grid = currentGrid();
  renderSummary(grid, selectedTable());
  renderPreview(grid);
}

// --- Output actions ----------------------------------------------------------

function csv() {
  return toCsv(currentGrid(), { delimiter: elements.delimiter.value });
}

async function handleCopy() {
  if (!currentGrid().length) return toast('Nothing to copy');
  const copied = await copyText(csv());
  toast(copied ? 'CSV copied' : 'Copy failed');
}

function handleExport() {
  const grid = currentGrid();
  if (!grid.length) return toast('Nothing to export');

  const ok = downloadText(csv(), exportFilename(SLUG, state.data.url, 'csv'), 'text/csv');
  toast(ok ? 'Exported ' + grid.length + ' rows' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  elements.table.addEventListener('change', render);
  elements.trim.addEventListener('change', render);
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', handleExport);

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const data = await runInPage(tab.id, collectTables);
    state = { data };

    if (!data.tables.length) {
      showState(
        elements.main,
        'No tables on this page.',
        'This extension reads <table> elements. Grids built from <div>s cannot be converted.'
      );
      return;
    }

    for (const table of data.tables) {
      const option = document.createElement('option');
      option.value = String(table.index);
      option.textContent = describeTable(table);
      elements.table.appendChild(option);
    }

    elements.toolbar.hidden = false;
    elements.options.hidden = false;
    render();
  } catch (error) {
    showState(
      elements.main,
      'Could not read this page.',
      (error && error.message ? error.message : String(error)) +
        ' Try reloading the tab, then reopen the extension.',
      'error'
    );
  }
}

init();
