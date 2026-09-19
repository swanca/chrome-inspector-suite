/**
 * Popup controller.
 *
 * Orchestration only: read the storefront from the MAIN world, hand it to the
 * pure helpers in src/lib/shopify.js, and render three views over the result.
 */

import { collectStore } from '../content/collect.js';
import {
  detectShopify,
  describeStore,
  detectApps,
  detectPlatformFeatures,
  auditStore,
  formatPrice,
  toRows,
} from '../lib/shopify.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, row, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText, toCsv } from '../shared/output.js';
import { createLicenseGate } from '../shared/license-ui.js';

const SLUG = 'shopify-store-inspector';

const MAX_VARIANT_ROWS = 100;

const BADGE = { ok: 'OK', warning: 'WARN', error: 'FAIL', info: 'INFO' };

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  views: document.getElementById('views'),
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

/** @type {object|null} */
let state = null;
let view = 'audit';

// --- Rendering ---------------------------------------------------------------

function renderSummary() {
  clear(elements.summary);
  const { data, audit, apps, detection } = state;

  if (detection.confidence === 'low') {
    elements.summary.appendChild(pill('warning', 'CDN only'));
  }
  if (data.currency) elements.summary.appendChild(pill('info', data.currency));

  if (audit.summary.errors) {
    elements.summary.appendChild(pill('error', audit.summary.errors + ' issues'));
  } else if (audit.summary.warnings) {
    elements.summary.appendChild(pill('warning', audit.summary.warnings + ' to fix'));
  } else {
    elements.summary.appendChild(pill('ok', 'healthy'));
  }

  if (apps.length) elements.summary.appendChild(pill('info', apps.length + ' apps'));
}

function renderAudit() {
  const { audit, features } = state;

  if (!audit.findings.length) {
    showState(
      elements.main,
      'Nothing to fix here.',
      'Every check this extension runs on the storefront passed.'
    );
    return;
  }

  const { shown, hidden } = gate.preview('audit', audit.findings);

  const section = el('section', 'group');
  section.appendChild(
    el('h2', 'group__title', audit.findings.length + ' finding' + (audit.findings.length === 1 ? '' : 's'))
  );

  for (const finding of shown) {
    const node = el('div', 'finding');
    node.appendChild(
      el('span', 'finding__badge finding__badge--' + finding.status, BADGE[finding.status] || '-')
    );
    node.appendChild(el('span', 'finding__label', finding.label));
    node.appendChild(el('span', 'finding__message', finding.message));
    section.appendChild(node);
  }

  const lock = gate.lockNotice('audit', hidden);
  if (lock) section.appendChild(lock);

  elements.main.appendChild(section);

  if (features.length) {
    const platform = el('section', 'group');
    platform.appendChild(el('h2', 'group__title', 'Platform'));

    for (const feature of features) {
      const item = el('div', 'item');
      const body = el('div', 'item__body');
      body.appendChild(el('div', 'item__title', feature.name));
      body.appendChild(el('div', 'item__meta', feature.note));
      item.appendChild(body);
      platform.appendChild(item);
    }

    elements.main.appendChild(platform);
  }
}

function renderDetails() {
  for (const group of state.description.groups) {
    const section = el('section', 'group');
    section.appendChild(el('h2', 'group__title', group.label));

    for (const item of group.rows) {
      const node = row(item.label, item.value || '(none)');
      if (item.status === 'warning') node.classList.add('row--warning');
      section.appendChild(node);
      if (item.note) section.appendChild(el('p', 'state__hint', item.note));
    }

    elements.main.appendChild(section);
  }

  if (state.apps.length) {
    const section = el('section', 'group');
    section.appendChild(el('h2', 'group__title', 'Apps detected'));

    const wrapper = el('div', 'item');
    const body = el('div', 'item__body');
    const tags = el('div', 'tags');
    for (const app of state.apps) tags.appendChild(el('span', 'tag', app.name));
    body.appendChild(tags);
    wrapper.appendChild(body);
    section.appendChild(wrapper);

    elements.main.appendChild(section);
  }
}

function renderVariants() {
  const product = state.data.product || {};
  const variants = product.variants || [];

  if (!variants.length) {
    showState(
      elements.main,
      'No variant data on this page.',
      product.source === 'none'
        ? 'This theme does not publish its product JSON.'
        : 'This is not a product page.'
    );
    return;
  }

  const scroller = el('div', 'scroller');
  const table = el('table', 'data-table');

  const head = el('thead');
  const headRow = el('tr');
  for (const heading of ['Variant', 'SKU', 'Price', 'Stock']) {
    headRow.appendChild(el('th', null, heading));
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const { shown, hidden } = gate.preview('variants', variants.slice(0, MAX_VARIANT_ROWS));

  const body = el('tbody');
  for (const variant of shown) {
    const tr = el('tr');
    tr.appendChild(el('td', null, variant.title || variant.id));
    tr.appendChild(el('td', null, variant.sku || '-'));
    tr.appendChild(el('td', null, formatPrice(variant.price, state.data.currency) || '-'));

    const stock =
      variant.available === null
        ? '-'
        : variant.available
          ? variant.inventoryQuantity === null
            ? 'yes'
            : String(variant.inventoryQuantity)
          : 'out';
    tr.appendChild(el('td', null, stock));
    body.appendChild(tr);
  }
  table.appendChild(body);

  scroller.appendChild(table);
  elements.main.appendChild(scroller);

  const lock = gate.lockNotice('variants', hidden);
  if (lock) elements.main.appendChild(lock);

  if (variants.length > MAX_VARIANT_ROWS) {
    elements.main.appendChild(
      el('p', 'state__hint', 'Showing ' + MAX_VARIANT_ROWS + ' of ' + variants.length + '.')
    );
  }
}

function render() {
  if (!state) return;
  clear(elements.main);

  if (view === 'audit') renderAudit();
  else if (view === 'details') renderDetails();
  else renderVariants();

  for (const button of elements.views.querySelectorAll('button')) {
    button.classList.toggle('btn--active', button.dataset.view === view);
    button.textContent = button.textContent.replace(/ \u00b7 Pro$/, '');
    if (!gate.can(button.dataset.view)) button.textContent += ' \u00b7 Pro';
  }
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  if (!state) return;

  const lines = ['# Shopify store', '', 'URL: ' + state.data.url, ''];

  if (state.audit.findings.length) {
    lines.push('## Findings');
    for (const finding of state.audit.findings) {
      lines.push('- [' + (BADGE[finding.status] || '-') + '] ' + finding.label + ' - ' + finding.message);
    }
    lines.push('');
  }

  for (const group of state.description.groups) {
    lines.push('## ' + group.label);
    for (const item of group.rows) lines.push('- ' + item.label + ': ' + (item.value || '(none)'));
    lines.push('');
  }

  if (state.apps.length) {
    lines.push('## Apps');
    for (const app of state.apps) lines.push('- ' + app.name);
  }

  const copied = await copyText(lines.join('\n').trim());
  toast(copied ? 'Report copied' : 'Copy failed');
}

function handleExport() {
  if (!state) return;

  const rows = toRows(state.description, state.apps);
  for (const finding of state.audit.findings) {
    rows.push(['Findings', finding.label, finding.status + ': ' + finding.message]);
  }

  const ok = downloadText(
    toCsv(rows),
    exportFilename(SLUG, state.data.url, 'csv'),
    'text/csv'
  );
  toast(ok ? 'Exported' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  gate = createLicenseGate({
    slug: SLUG,
    name: 'Shopify Store Inspector',
    main: elements.main,
    toast,
    onChange: () => {
      renderBadge();
      render();
    },
  });
  await gate.load();
  renderBadge();

  // The audit is the paid view, so free users open on Details instead of
  // being met by an upgrade panel.
  view = gate.can('audit') || gate.previewable('audit') ? 'audit' : 'details';

  elements.views.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    const next = button.dataset.view;
    if (!gate.can(next) && !gate.previewable(next)) return gate.showPanel(next);
    view = next;
    render();
  });
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', gate.require('export-csv', handleExport));

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const data = await runInPage(tab.id, collectStore, { world: 'MAIN' });
    const detection = detectShopify(data);

    if (!detection.isShopify) {
      showState(
        elements.main,
        'This is not a Shopify store.',
        'No Shopify global and no Shopify CDN assets were found on this page.'
      );
      return;
    }

    state = {
      data,
      detection,
      description: describeStore(data),
      apps: detectApps(data.urls),
      features: detectPlatformFeatures(data),
      audit: auditStore(data),
    };

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
