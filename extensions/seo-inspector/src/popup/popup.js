/**
 * Popup controller.
 *
 * Orchestration only: ask the active tab for its data, hand it to the pure
 * audit rules, render the result, and wire the two output buttons.
 */

import { collectPageData } from '../content/collect.js';
import { auditPage, GROUPS } from '../lib/audit.js';
import { toMarkdown, toJson } from '../lib/format.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText } from '../shared/output.js';
import { createLicenseGate } from '../shared/license-ui.js';

const SLUG = 'seo-inspector';

const BADGE = { ok: 'OK', warning: 'WARN', error: 'FAIL', info: 'INFO' };

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  onlyIssues: document.getElementById('only-issues'),
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

/** @type {{data: object, audit: object}|null} */
let state = null;

// --- Rendering ---------------------------------------------------------------

function renderSummary(summary) {
  clear(elements.summary);

  if (summary.error > 0) {
    elements.summary.appendChild(el('span', 'pill pill--error', summary.error + ' error'));
  }
  if (summary.warning > 0) {
    elements.summary.appendChild(el('span', 'pill pill--warning', summary.warning + ' warning'));
  }
  if (summary.error === 0 && summary.warning === 0) {
    elements.summary.appendChild(el('span', 'pill pill--ok', 'All checks passed'));
  } else {
    elements.summary.appendChild(el('span', 'pill pill--ok', summary.ok + ' ok'));
  }
}

function renderFinding(item) {
  const row = el('div', 'finding');

  row.appendChild(
    el('span', 'finding__badge finding__badge--' + item.status, BADGE[item.status] || '-')
  );
  row.appendChild(el('span', 'finding__label', item.label));
  row.appendChild(el('span', 'finding__message', item.message));

  if (item.value) row.appendChild(el('pre', 'finding__value', item.value));

  return row;
}

/** A compact mock of how the link renders when shared. */
function renderSocialPreview(data) {
  const og = data.og || {};
  const title = og.title || data.title;
  const description = og.description || data.description;
  if (!title && !description && !og.image) return null;

  const card = el('div', 'preview');

  if (og.image) {
    const image = el('img', 'preview__image');
    image.src = og.image;
    image.alt = og.imageAlt || '';
    image.referrerPolicy = 'no-referrer';
    image.loading = 'lazy';
    // A dead or hotlink-protected image must not leave a broken icon behind.
    image.addEventListener('error', () => image.remove());
    card.appendChild(image);
  }

  const body = el('div', 'preview__body');

  let host = '';
  try {
    host = new URL(og.url || data.url).hostname;
  } catch {
    host = '';
  }
  if (host) body.appendChild(el('div', 'preview__host', host));

  body.appendChild(el('div', 'preview__title', title || '(no title)'));
  if (description) body.appendChild(el('div', 'preview__description', description));
  card.appendChild(body);

  return card;
}

function render() {
  if (!state) return;

  const onlyIssues = elements.onlyIssues.checked;
  const visible = onlyIssues
    ? state.audit.findings.filter((item) => item.status === 'warning' || item.status === 'error')
    : state.audit.findings;

  clear(elements.main);

  if (!visible.length) {
    showState(elements.main, 'No issues found.', 'Untick "Issues only" to see every check.');
    return;
  }

  for (const group of GROUPS) {
    const rows = visible.filter((item) => item.group === group.id);
    if (!rows.length) continue;

    const section = el('section', 'group');
    section.appendChild(el('h2', 'group__title', group.label));
    for (const item of rows) section.appendChild(renderFinding(item));

    if (group.id === 'social' && !onlyIssues && gate.can('social-preview')) {
      const preview = renderSocialPreview(state.data);
      if (preview) section.appendChild(preview);
    }

    elements.main.appendChild(section);
  }
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  if (!state) return;
  const copied = await copyText(toMarkdown(state.data, state.audit));
  toast(copied ? 'Report copied' : 'Copy failed');
}

function handleExport() {
  if (!state) return;
  const ok = downloadText(
    toJson(state.data, state.audit),
    exportFilename(SLUG, state.data.url, 'json'),
    'application/json'
  );
  toast(ok ? 'Exported' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  gate = createLicenseGate({
    slug: SLUG,
    name: 'SEO Inspector',
    main: elements.main,
    toast,
    onChange: () => {
      renderBadge();
      render();
    },
  });
  await gate.load();
  renderBadge();

  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', gate.require('export-json', handleExport));
  elements.onlyIssues.addEventListener('change', render);

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const data = await runInPage(tab.id, collectPageData);
    state = { data, audit: auditPage(data) };

    renderSummary(state.audit.summary);
    elements.toolbar.hidden = false;
    render();
  } catch (error) {
    showState(
      elements.main,
      'Could not analyse this page.',
      (error && error.message ? error.message : String(error)) +
        ' Try reloading the tab, then reopen the extension.',
      'error'
    );
  }
}

init();
