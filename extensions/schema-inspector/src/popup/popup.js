/**
 * Popup controller.
 *
 * Orchestration only: read the page's structured data, hand it to the pure
 * rules in src/lib/schema.js, and render entity by entity.
 */

import { collectSchema } from '../content/collect.js';
import { auditSchema, toJson } from '../lib/schema.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, jsonTree, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText } from '../shared/output.js';

const SLUG = 'schema-inspector';

const BADGE = { ok: 'OK', warning: 'WARN', error: 'FAIL', info: 'INFO' };

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  onlyIssues: document.getElementById('only-issues'),
  raw: document.getElementById('raw'),
  copy: document.getElementById('copy'),
  export: document.getElementById('export'),
  main: document.getElementById('main'),
  toast: document.getElementById('toast'),
};

const toast = createToast(elements.toast);

/** @type {{data: object, audit: object}|null} */
let state = null;

// --- Rendering ---------------------------------------------------------------

function renderSummary() {
  clear(elements.summary);
  const { summary } = state.audit;

  elements.summary.appendChild(pill('info', summary.entities + ' entities'));
  if (summary.errors) elements.summary.appendChild(pill('error', summary.errors + ' errors'));
  else if (summary.warnings) {
    elements.summary.appendChild(pill('warning', summary.warnings + ' warnings'));
  } else elements.summary.appendChild(pill('ok', 'valid'));
}

function renderFinding(finding) {
  const row = el('div', 'finding');
  row.appendChild(
    el('span', 'finding__badge finding__badge--' + finding.status, BADGE[finding.status] || '-')
  );
  row.appendChild(el('span', 'finding__label', finding.label));
  row.appendChild(el('span', 'finding__message', finding.message));
  return row;
}

function renderParseError(block) {
  const section = el('section', 'group');
  section.appendChild(el('h2', 'group__title', 'Invalid JSON-LD block ' + (block.index + 1)));

  const row = el('div', 'finding');
  row.appendChild(el('span', 'finding__badge finding__badge--error', 'FAIL'));
  row.appendChild(el('span', 'finding__label', 'Parse error'));
  row.appendChild(el('span', 'finding__message', block.error));
  if (block.excerpt) row.appendChild(el('pre', 'finding__value', block.excerpt));

  section.appendChild(row);
  return section;
}

function renderEntity(entity) {
  const onlyIssues = elements.onlyIssues.checked;
  const findings = onlyIssues
    ? entity.findings.filter((finding) => finding.status === 'error' || finding.status === 'warning')
    : entity.findings;

  if (onlyIssues && !findings.length) return null;

  const section = el('section', 'group');

  const title = el('h2', 'group__title', entity.type + '  ·  ' + entity.source);
  section.appendChild(title);

  for (const finding of findings) section.appendChild(renderFinding(finding));

  if (elements.raw.checked) {
    const tree = el('div', 'tree');
    tree.appendChild(jsonTree(entity.properties, entity.type, 0, 1));
    section.appendChild(tree);
  }

  return section;
}

function render() {
  if (!state) return;
  clear(elements.main);

  for (const block of state.audit.parseErrors) {
    elements.main.appendChild(renderParseError(block));
  }

  let shown = 0;
  for (const entity of state.audit.entities) {
    const section = renderEntity(entity);
    if (section) {
      elements.main.appendChild(section);
      shown++;
    }
  }

  if (!shown && !state.audit.parseErrors.length) {
    showState(
      elements.main,
      elements.onlyIssues.checked ? 'No issues found.' : 'No structured data on this page.',
      elements.onlyIssues.checked
        ? 'Untick "Issues only" to see every check.'
        : 'Nothing in JSON-LD or Microdata was found.'
    );
  }
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  if (!state) return;

  const lines = ['# Schema Inspector', '', 'URL: ' + state.data.url, ''];

  for (const block of state.audit.parseErrors) {
    lines.push('- [FAIL] JSON-LD block ' + (block.index + 1) + ': ' + block.error);
  }

  for (const entity of state.audit.entities) {
    lines.push('## ' + entity.type + ' (' + entity.source + ')');
    for (const finding of entity.findings) {
      lines.push('- [' + (BADGE[finding.status] || '-') + '] ' + finding.label + ' - ' + finding.message);
    }
    lines.push('');
  }

  const copied = await copyText(lines.join('\n').trim());
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

  elements.onlyIssues.addEventListener('change', render);
  elements.raw.addEventListener('change', render);
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', handleExport);

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const data = await runInPage(tab.id, collectSchema);
    state = { data, audit: auditSchema(data) };

    if (!state.audit.entities.length && !state.audit.parseErrors.length) {
      showState(
        elements.main,
        'No structured data on this page.',
        'Nothing in JSON-LD or Microdata was found.'
      );
      return;
    }

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
