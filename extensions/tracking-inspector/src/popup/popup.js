/**
 * Popup controller.
 *
 * Orchestration only: read the page's signals from the MAIN world, hand them to
 * the pure detector in src/lib/trackers.js, and render what was found.
 */

import { collectSignals } from '../content/collect.js';
import { detectTrackers, extractIds, summarize, groupByCategory, toRows } from '../lib/trackers.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText, toCsv } from '../shared/output.js';
import { createLicenseGate } from '../shared/license-ui.js';

const SLUG = 'tracking-inspector';

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  evidence: document.getElementById('evidence'),
  copy: document.getElementById('copy'),
  export: document.getElementById('export'),
  main: document.getElementById('main'),
  toast: document.getElementById('toast'),
  pro: document.getElementById('pro'),
};

const toast = createToast(elements.toast);

/** The Pro gate. Created first, because the button handlers close over it. */
let gate = null;

function renderBadge() {
  clear(elements.pro);
  elements.pro.appendChild(gate.badge());
}

/** @type {{signals: object, detected: Array, ids: Array, summary: object}|null} */
let state = null;

// --- Rendering ---------------------------------------------------------------

function renderSummary() {
  clear(elements.summary);
  const { summary } = state;

  if (!summary.total) {
    elements.summary.appendChild(pill('ok', 'No trackers found'));
    return;
  }

  elements.summary.appendChild(pill('info', summary.total + ' trackers'));
  elements.summary.appendChild(
    summary.hasConsent ? pill('ok', 'consent tool') : pill('warning', 'no consent tool')
  );
}

function renderTracker(tracker) {
  const item = el('div', 'item');
  const body = el('div', 'item__body');

  body.appendChild(el('div', 'item__title', tracker.name));

  if (elements.evidence.checked) {
    const tags = el('div', 'tags');
    for (const evidence of tracker.evidence) tags.appendChild(el('span', 'tag', evidence));
    body.appendChild(tags);
  }

  item.appendChild(body);
  return item;
}

function renderIds() {
  if (!state.ids.length) return null;

  const { shown, hidden } = gate.preview('tag-ids', state.ids);
  if (!shown.length) return null;

  const section = el('section', 'group');
  section.appendChild(el('h2', 'group__title', 'Tag identifiers'));

  for (const id of shown) {
    const item = el('div', 'item');
    const body = el('div', 'item__body');
    body.appendChild(el('div', 'item__title', id.value));
    body.appendChild(el('div', 'item__meta', id.label));
    item.appendChild(body);
    section.appendChild(item);
  }

  const lock = gate.lockNotice('tag-ids', hidden);
  if (lock) section.appendChild(lock);

  return section;
}

function render() {
  if (!state) return;
  clear(elements.main);

  if (!state.detected.length) {
    showState(
      elements.main,
      'No known trackers on this page.',
      'Checked ' + state.signals.scripts.length + ' scripts, the page globals and the cookie names.'
    );
    return;
  }

  if (state.summary.needsConsent && !state.summary.hasConsent) {
    const notice = el('div', 'finding');
    notice.appendChild(el('span', 'finding__badge finding__badge--warning', 'WARN'));
    notice.appendChild(el('span', 'finding__label', 'No consent tool detected'));
    notice.appendChild(
      el(
        'span',
        'finding__message',
        'This page loads advertising or session-replay trackers but no consent management platform was found.'
      )
    );
    elements.main.appendChild(notice);
  }

  for (const group of groupByCategory(state.detected)) {
    const section = el('section', 'group');
    section.appendChild(el('h2', 'group__title', group.label));

    const list = el('div', 'list');
    for (const tracker of group.trackers) list.appendChild(renderTracker(tracker));
    section.appendChild(list);

    elements.main.appendChild(section);
  }

  const ids = renderIds();
  if (ids) elements.main.appendChild(ids);
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  if (!state || !state.detected.length) return toast('Nothing to copy');

  const lines = ['Trackers on ' + state.signals.url, ''];
  for (const group of groupByCategory(state.detected)) {
    lines.push('## ' + group.label);
    for (const tracker of group.trackers) {
      lines.push('- ' + tracker.name + ' (' + tracker.evidence.join(', ') + ')');
    }
    lines.push('');
  }
  if (state.ids.length) {
    lines.push('## Tag identifiers');
    for (const id of state.ids) lines.push('- ' + id.label + ': ' + id.value);
  }

  const copied = await copyText(lines.join('\n').trim());
  toast(copied ? 'Report copied' : 'Copy failed');
}

function handleExport() {
  if (!state || !state.detected.length) return toast('Nothing to export');

  const ok = downloadText(
    toCsv(toRows(state.detected)),
    exportFilename(SLUG, state.signals.url, 'csv'),
    'text/csv'
  );
  toast(ok ? 'Exported' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  gate = createLicenseGate({
    slug: SLUG,
    name: 'Tracking Inspector',
    main: elements.main,
    toast,
    onChange: () => {
      renderBadge();
      render();
    },
  });
  await gate.load();
  renderBadge();

  elements.evidence.addEventListener('change', render);
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', gate.require('export-csv', handleExport));

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const signals = await runInPage(tab.id, collectSignals, { world: 'MAIN' });
    const detected = detectTrackers(signals);

    state = { signals, detected, ids: extractIds(signals), summary: summarize(detected) };

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
