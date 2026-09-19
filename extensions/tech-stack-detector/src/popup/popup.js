/**
 * Popup controller.
 *
 * Orchestration only: read the page's signals from the MAIN world, hand them to
 * the pure detector in src/lib/stack.js, and render what was identified.
 */

import { collectSignals } from '../content/collect.js';
import { detectStack, summarize, groupByCategory, toRows } from '../lib/stack.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText, toCsv } from '../shared/output.js';

const SLUG = 'tech-stack-detector';

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  evidence: document.getElementById('evidence'),
  confident: document.getElementById('confident'),
  copy: document.getElementById('copy'),
  export: document.getElementById('export'),
  main: document.getElementById('main'),
  toast: document.getElementById('toast'),
};

const toast = createToast(elements.toast);

/** @type {{signals: object, detected: Array}|null} */
let state = null;

function visible() {
  if (!state) return [];
  return elements.confident.checked
    ? state.detected.filter((item) => item.confidence === 'high')
    : state.detected;
}

// --- Rendering ---------------------------------------------------------------

function renderSummary() {
  clear(elements.summary);
  const summary = summarize(state.detected);

  if (!summary.total) {
    elements.summary.appendChild(pill('info', 'Nothing recognised'));
    return;
  }
  elements.summary.appendChild(pill('info', summary.total + ' detected'));
  if (summary.confident) elements.summary.appendChild(pill('ok', summary.confident + ' confident'));
}

function renderTechnology(item) {
  const node = el('div', 'item');
  const body = el('div', 'item__body');

  body.appendChild(el('div', 'item__title', item.name + (item.version ? ' ' + item.version : '')));

  if (item.confidence === 'low') {
    body.appendChild(el('div', 'item__meta', 'One signal only - treat as a guess.'));
  }

  if (elements.evidence.checked) {
    const tags = el('div', 'tags');
    for (const evidence of item.evidence) tags.appendChild(el('span', 'tag', evidence));
    body.appendChild(tags);
  }

  node.appendChild(body);
  return node;
}

function render() {
  if (!state) return;
  const items = visible();
  clear(elements.main);

  if (!items.length) {
    showState(
      elements.main,
      state.detected.length ? 'Nothing confident enough to show.' : 'No known technology detected.',
      state.detected.length
        ? 'Untick "Confident only" to see ' + state.detected.length + ' single-signal guesses.'
        : 'The page may be plain HTML, or it may load everything after this snapshot was taken.'
    );
    return;
  }

  for (const group of groupByCategory(items)) {
    const section = el('section', 'group');
    section.appendChild(el('h2', 'group__title', group.label));

    const list = el('div', 'list');
    for (const item of group.items) list.appendChild(renderTechnology(item));
    section.appendChild(list);

    elements.main.appendChild(section);
  }
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  const items = visible();
  if (!items.length) return toast('Nothing to copy');

  const lines = ['Tech stack of ' + state.signals.url, ''];
  for (const group of groupByCategory(items)) {
    lines.push('## ' + group.label);
    for (const item of group.items) {
      lines.push('- ' + item.name + (item.version ? ' ' + item.version : ''));
    }
    lines.push('');
  }

  const copied = await copyText(lines.join('\n').trim());
  toast(copied ? 'Stack copied' : 'Copy failed');
}

function handleExport() {
  const items = visible();
  if (!items.length) return toast('Nothing to export');

  const ok = downloadText(
    toCsv(toRows(items)),
    exportFilename(SLUG, state.signals.url, 'csv'),
    'text/csv'
  );
  toast(ok ? 'Exported' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  elements.evidence.addEventListener('change', render);
  elements.confident.addEventListener('change', render);
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', handleExport);

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const signals = await runInPage(tab.id, collectSignals, { world: 'MAIN' });
    state = { signals, detected: detectStack(signals) };

    renderSummary();
    elements.toolbar.hidden = false;
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
