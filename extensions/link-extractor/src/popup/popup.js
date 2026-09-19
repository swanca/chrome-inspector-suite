/**
 * Popup controller.
 *
 * Orchestration only: read the tab's links, hand them to the pure helpers in
 * src/lib/links.js, render, and wire the filter and export controls.
 */

import { collectLinks } from '../content/collect.js';
import {
  annotate,
  filterLinks,
  summarize,
  toRows,
  toPlainList,
  SCOPES,
} from '../lib/links.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText, toCsv } from '../shared/output.js';

const SLUG = 'link-extractor';

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  scope: document.getElementById('scope'),
  search: document.getElementById('search'),
  dedupe: document.getElementById('dedupe'),
  copy: document.getElementById('copy'),
  export: document.getElementById('export'),
  main: document.getElementById('main'),
  toast: document.getElementById('toast'),
};

const toast = createToast(elements.toast);

/** @type {{data: object, links: Array}|null} */
let state = null;

/** Debounces the search box so typing does not re-render on every keystroke. */
let searchTimer = null;

function currentOptions() {
  return {
    scope: elements.scope.value,
    query: elements.search.value,
    dedupe: elements.dedupe.checked,
  };
}

function visibleLinks() {
  return state ? filterLinks(state.links, currentOptions()) : [];
}

// --- Rendering ---------------------------------------------------------------

function renderSummary(summary) {
  clear(elements.summary);
  elements.summary.appendChild(pill('info', summary.internal + ' internal'));
  elements.summary.appendChild(pill('info', summary.external + ' external'));
  if (summary.untitled > 0) {
    elements.summary.appendChild(pill('warning', summary.untitled + ' unlabelled'));
  }
}

function renderLink(link) {
  const item = el('div', 'item');
  const body = el('div', 'item__body');

  body.appendChild(el('div', 'item__title', link.label || '(no link text)'));
  body.appendChild(el('div', 'item__mono', link.href || link.raw));

  const tags = el('div', 'tags');
  tags.appendChild(el('span', 'tag', link.kind));
  if (link.nofollow) tags.appendChild(el('span', 'tag', 'nofollow'));
  if (link.target) tags.appendChild(el('span', 'tag', 'target=' + link.target));
  body.appendChild(tags);

  item.appendChild(body);
  return item;
}

function render() {
  if (!state) return;

  const links = visibleLinks();
  clear(elements.main);

  if (!links.length) {
    showState(
      elements.main,
      'No links match.',
      state.links.length
        ? 'Loosen the filter to see the other ' + state.links.length + ' links.'
        : 'This page has no links at all.'
    );
    return;
  }

  const count = el('p', 'group__title', links.length + ' link' + (links.length === 1 ? '' : 's'));
  elements.main.appendChild(count);

  const list = el('div', 'list');
  for (const link of links) list.appendChild(renderLink(link));
  elements.main.appendChild(list);

  if (state.data.truncated) {
    elements.main.appendChild(
      el('p', 'state__hint', 'Only the first ' + state.links.length + ' links were read.')
    );
  }
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  const links = visibleLinks();
  if (!links.length) return toast('Nothing to copy');

  const copied = await copyText(toPlainList(links));
  toast(copied ? links.length + ' URLs copied' : 'Copy failed');
}

function handleExport() {
  const links = visibleLinks();
  if (!links.length) return toast('Nothing to export');

  const ok = downloadText(
    toCsv(toRows(links)),
    exportFilename(SLUG, state.data.url, 'csv'),
    'text/csv'
  );
  toast(ok ? 'Exported ' + links.length + ' links' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  for (const scope of SCOPES) {
    const option = document.createElement('option');
    option.value = scope.id;
    option.textContent = scope.label;
    elements.scope.appendChild(option);
  }

  elements.scope.addEventListener('change', render);
  elements.dedupe.addEventListener('change', render);
  elements.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', handleExport);

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const data = await runInPage(tab.id, collectLinks);
    state = { data, links: annotate(data) };

    renderSummary(summarize(state.links));
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
