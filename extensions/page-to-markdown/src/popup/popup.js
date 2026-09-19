/**
 * Popup controller.
 *
 * Orchestration only: read the page's block tree, hand it to the pure renderer
 * in src/lib/markdown.js, preview the result, and wire the output buttons.
 */

import { collectDocument } from '../content/collect.js';
import { renderMarkdown } from '../lib/markdown.js';

import { describeBlockedUrl, getActiveTab, runInPage } from '../shared/page.js';
import { el, clear, createToast, showState, pill, showVersion } from '../shared/ui.js';
import { exportFilename, copyText, downloadText } from '../shared/output.js';
import { createLicenseGate } from '../shared/license-ui.js';

const SLUG = 'page-to-markdown';

const elements = {
  summary: document.getElementById('summary'),
  toolbar: document.getElementById('toolbar'),
  links: document.getElementById('links'),
  images: document.getElementById('images'),
  frontMatter: document.getElementById('front-matter'),
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

/** @type {{doc: object}|null} */
let state = null;

function options() {
  return {
    links: elements.links.checked,
    images: elements.images.checked,
    frontMatter: elements.frontMatter.checked && gate.can('front-matter'),
  };
}

function markdown() {
  return state ? renderMarkdown(state.doc, options()) : '';
}

// --- Rendering ---------------------------------------------------------------

function render() {
  const text = markdown();
  clear(elements.summary);
  clear(elements.main);

  if (!text) {
    showState(
      elements.main,
      'Nothing readable on this page.',
      'The extension looks for article text; a page that is all script or canvas has none.'
    );
    return;
  }

  const words = text.trim().split(/\s+/).length;
  elements.summary.appendChild(pill('info', words + ' words'));
  if (state.doc.rootSelector) {
    elements.summary.appendChild(pill('info', state.doc.rootSelector));
  }
  if (state.doc.truncated) elements.summary.appendChild(pill('warning', 'truncated'));

  elements.main.appendChild(el('pre', 'output', text));
}

// --- Output actions ----------------------------------------------------------

async function handleCopy() {
  const text = markdown();
  if (!text) return toast('Nothing to copy');

  const copied = await copyText(text);
  toast(copied ? 'Markdown copied' : 'Copy failed');
}

function handleExport() {
  const text = markdown();
  if (!text) return toast('Nothing to export');

  const ok = downloadText(text, exportFilename(SLUG, state.doc.url, 'md'), 'text/markdown');
  toast(ok ? 'Exported' : 'Export failed');
}

// --- Boot --------------------------------------------------------------------

async function init() {
  showVersion(document.querySelector('.brand'));

  gate = createLicenseGate({
    slug: SLUG,
    name: 'Page to Markdown',
    main: elements.main,
    toast,
    onChange: () => {
      renderBadge();
      render();
    },
  });
  await gate.load();
  renderBadge();

  for (const control of [elements.links, elements.images, elements.frontMatter]) {
    control.addEventListener('change', render);
  }
  elements.copy.addEventListener('click', handleCopy);
  elements.export.addEventListener('click', gate.require('export-md', handleExport));

  try {
    const tab = await getActiveTab();

    const blocked = describeBlockedUrl(tab.url);
    if (blocked) {
      showState(elements.main, blocked.message, blocked.hint);
      return;
    }

    state = { doc: await runInPage(tab.id, collectDocument) };

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
