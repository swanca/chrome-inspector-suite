/**
 * Popup controller.
 *
 * Orchestration only: read the page's images, hand them to the pure rules in
 * src/lib/alt.js, render, and wire the filter and export controls.
 */

import { collectImages } from '../content/collect.js';
import { annotate, summarize, filterImages, toRows, FILTERS } from '../lib/alt.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText, toCsv } from '../shared/output.js';
import { createLicenseGate } from '../shared/license-ui.js';

const SLUG = 'image-alt-inspector';

const BADGE = { ok: 'OK', warning: 'WARN', error: 'FAIL', info: 'INFO' };

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  filter: document.getElementById('filter'),
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

/** @type {{data: object, images: Array}|null} */
let state = null;

function visibleImages() {
  return state ? filterImages(state.images, elements.filter.value) : [];
}

// --- Rendering ---------------------------------------------------------------

function renderSummary(summary) {
  clear(elements.summary);

  if (summary.error) elements.summary.appendChild(pill('error', summary.error + ' missing'));
  if (summary.warning) elements.summary.appendChild(pill('warning', summary.warning + ' weak'));
  elements.summary.appendChild(pill('ok', summary.ok + ' good'));
  if (summary.info) elements.summary.appendChild(pill('info', summary.info + ' decorative'));
}

function renderImage(image) {
  const item = el('div', 'item');

  if (image.src && /^https?:/i.test(image.src)) {
    const thumb = el('img', 'item__thumb');
    thumb.src = image.src;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.referrerPolicy = 'no-referrer';
    // A dead or hotlink-protected image must not leave a broken icon behind.
    thumb.addEventListener('error', () => thumb.remove());
    item.appendChild(thumb);
  }

  const body = el('div', 'item__body');

  const alt = image.alt === null || image.alt === undefined ? '(no alt attribute)' : image.alt;
  body.appendChild(el('div', 'item__title', alt || '(empty alt, decorative)'));
  body.appendChild(el('div', 'item__meta', image.reason));
  body.appendChild(el('div', 'item__mono', image.rawSrc || image.src));

  const tags = el('div', 'tags');
  tags.appendChild(el('span', 'tag', image.kind));
  if (image.inLink) tags.appendChild(el('span', 'tag', 'in link'));
  if (image.loading) tags.appendChild(el('span', 'tag', 'loading=' + image.loading));
  body.appendChild(tags);

  item.appendChild(body);
  item.appendChild(
    el('span', 'finding__badge finding__badge--' + image.status, BADGE[image.status] || '-')
  );

  return item;
}

function render() {
  if (!state) return;

  const images = visibleImages();
  clear(elements.main);

  if (!images.length) {
    showState(
      elements.main,
      'No images match this filter.',
      state.images.length + ' image(s) found on the page in total.'
    );
    return;
  }

  elements.main.appendChild(
    el('p', 'group__title', images.length + ' image' + (images.length === 1 ? '' : 's'))
  );

  const list = el('div', 'list');
  for (const image of images) list.appendChild(renderImage(image));
  elements.main.appendChild(list);
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  const images = visibleImages();
  if (!images.length) return toast('Nothing to copy');

  const copied = await copyText(toCsv(toRows(images), { bom: false }));
  toast(copied ? images.length + ' rows copied' : 'Copy failed');
}

function handleExport() {
  const images = visibleImages();
  if (!images.length) return toast('Nothing to export');

  const ok = downloadText(
    toCsv(toRows(images)),
    exportFilename(SLUG, state.data.url, 'csv'),
    'text/csv'
  );
  toast(ok ? 'Exported ' + images.length + ' images' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  gate = createLicenseGate({
    slug: SLUG,
    name: 'Image ALT Inspector',
    main: elements.main,
    toast,
    onChange: () => {
      renderBadge();
      render();
    },
  });
  await gate.load();
  renderBadge();

  for (const filter of FILTERS) {
    const option = document.createElement('option');
    option.value = filter.id;
    option.textContent = filter.label;
    elements.filter.appendChild(option);
  }

  elements.filter.addEventListener('change', render);
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', gate.require('export-csv', handleExport));

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    const data = await runInPage(tab.id, collectImages);
    state = { data, images: annotate(data) };

    if (!state.images.length) {
      showState(elements.main, 'No images on this page.', 'Nothing to audit here.');
      return;
    }

    const summary = summarize(state.images);
    renderSummary(summary);

    // Open on the problems when there are any: that is what the user came for.
    elements.filter.value = summary.error || summary.warning ? 'issues' : 'all';

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
