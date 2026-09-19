/**
 * Popup controller.
 *
 * Orchestration only: read the page's data layers from the MAIN world, hand
 * them to the pure helpers in src/lib/datalayer.js, and render them as a tree.
 */

import { collectDataLayer } from '../content/collect.js';
import { annotate, summarize, filterEntries, toJson } from '../lib/datalayer.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, jsonTree, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText } from '../shared/output.js';

const SLUG = 'datalayer-viewer';

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  options: document.getElementById('options'),
  layer: document.getElementById('layer'),
  event: document.getElementById('event'),
  search: document.getElementById('search'),
  refresh: document.getElementById('refresh'),
  copy: document.getElementById('copy'),
  export: document.getElementById('export'),
  main: document.getElementById('main'),
  toast: document.getElementById('toast'),
};

const toast = createToast(elements.toast);

/** @type {{data: object, tabId: number}|null} */
let state = null;
let searchTimer = null;

function currentLayer() {
  if (!state) return null;
  return state.data.layers.find((layer) => layer.name === elements.layer.value) || null;
}

function visibleEntries() {
  const layer = currentLayer();
  if (!layer) return [];

  return filterEntries(annotate(layer.entries), {
    event: elements.event.value,
    query: elements.search.value,
  });
}

// --- Rendering ---------------------------------------------------------------

function renderSummary() {
  clear(elements.summary);
  const layer = currentLayer();
  if (!layer) return;

  const summary = summarize(annotate(layer.entries));
  elements.summary.appendChild(pill('info', summary.total + ' entries'));
  if (summary.events) elements.summary.appendChild(pill('ok', summary.events + ' events'));
  for (const container of state.data.containers.slice(0, 2)) {
    elements.summary.appendChild(pill('info', container));
  }
}

function renderEventOptions() {
  const layer = currentLayer();
  const previous = elements.event.value;
  clear(elements.event);

  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All events';
  elements.event.appendChild(all);

  if (!layer) return;

  for (const [name, count] of summarize(annotate(layer.entries)).counts) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name + ' (' + count + ')';
    elements.event.appendChild(option);
  }

  // Keep the chosen event when refreshing, if it still exists.
  if ([...elements.event.options].some((option) => option.value === previous)) {
    elements.event.value = previous;
  }
}

function renderEntries() {
  clear(elements.main);
  const entries = visibleEntries();
  const layer = currentLayer();

  if (!entries.length) {
    showState(
      elements.main,
      'Nothing matches.',
      layer && layer.entries.length
        ? 'This layer has ' + layer.entries.length + ' entries. Clear the filters to see them.'
        : 'This data layer is empty.'
    );
    return;
  }

  const tree = el('div', 'tree');
  for (const entry of entries) {
    const label = '#' + entry.index + (entry.event ? ' - ' + entry.event : ' - ' + entry.label);
    tree.appendChild(jsonTree(entry.value, label, 0, 1));
  }
  elements.main.appendChild(tree);

  if (layer && layer.truncated) {
    elements.main.appendChild(
      el('p', 'state__hint', 'Only the first ' + layer.entries.length + ' entries were read.')
    );
  }
}

function render() {
  renderSummary();
  renderEntries();
}

// --- Actions -----------------------------------------------------------------

async function load(tabId) {
  const data = await runInPage(tabId, collectDataLayer, { world: 'MAIN' });
  state = { data, tabId };

  if (!data.layers.length) {
    clear(elements.summary);
    elements.toolbar.hidden = true;
    elements.options.hidden = true;
    showState(
      elements.main,
      'No data layer on this page.',
      'Nothing named dataLayer, digitalData or utag_data exists on window.'
    );
    return;
  }

  const previous = elements.layer.value;
  clear(elements.layer);
  for (const layer of data.layers) {
    const option = document.createElement('option');
    option.value = layer.name;
    option.textContent = layer.name + ' (' + layer.total + ')';
    elements.layer.appendChild(option);
  }
  if (data.layers.some((layer) => layer.name === previous)) elements.layer.value = previous;

  renderEventOptions();
  elements.toolbar.hidden = false;
  elements.options.hidden = false;
  render();
}

async function handleRefresh() {
  if (!state) return;
  try {
    await load(state.tabId);
    toast('Refreshed');
  } catch (error) {
    toast('Refresh failed');
  }
}

async function handleCopy() {
  const entries = visibleEntries();
  if (!entries.length) return toast('Nothing to copy');

  const copied = await copyText(JSON.stringify(entries.map((entry) => entry.value), null, 2));
  toast(copied ? entries.length + ' entries copied' : 'Copy failed');
}

function handleExport() {
  if (!state) return;
  const ok = downloadText(
    toJson(state.data),
    exportFilename(SLUG, state.data.url, 'json'),
    'application/json'
  );
  toast(ok ? 'Exported' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  elements.layer.addEventListener('change', () => {
    renderEventOptions();
    render();
  });
  elements.event.addEventListener('change', render);
  elements.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderEntries, 150);
  });
  elements.refresh.addEventListener('click', handleRefresh);
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', handleExport);

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    await load(tab.id);
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
