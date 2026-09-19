/**
 * GENERATED FILE - do not edit.
 * Source: shared/license-ui.js
 * Run `npm run sync` after changing the source.
 *
 * The Pro gate, shared by every extension in this repository.
 *
 * One object owns the whole paid-tier surface: reading the stored license,
 * deciding what is unlocked, showing the upgrade panel, and accepting a key.
 * A popup wires it in three lines and never touches entitlements directly.
 */

import {
  TIERS,
  can,
  rowLimit,
  previewCount,
  featuresFor,
  loadEntitlements,
  rememberInstall,
  saveLicense,
  clearLicense,
  STORE_URL,
  STORE_LIVE,
} from './entitlements.js';
import { LICENSE_PUBLIC_KEY } from './license-key.js';
import { el, clear } from './ui.js';

/** Human labels for the gated features, so the panel explains what is locked. */
const LABELS = {
  'export-json': 'Export as JSON',
  'export-csv': 'Export as CSV',
  'export-md': 'Export as Markdown',
  'social-preview': 'Social sharing preview',
  'tag-ids': 'Tag identifier extraction',
  audit: 'Storefront audit',
  variants: 'Variant table',
  'raw-tree': 'Raw data tree',
  refresh: 'Live refresh',
  uncapped: 'Uncapped copy and export',
  'front-matter': 'YAML front matter',
  delimiter: 'Delimiter choice',
  evidence: 'Detection evidence',
  versions: 'Library versions',
};

const label = (feature) => LABELS[feature] || feature;

/**
 * Creates the gate for one popup.
 *
 * @param {object} options
 * @param {string} options.slug            This extension's slug.
 * @param {string} options.name            Its display name.
 * @param {HTMLElement} options.main       Where the upgrade panel is rendered.
 * @param {(message: string) => void} options.toast
 * @param {() => void} [options.onChange]  Called after the tier changes.
 */
export function createLicenseGate(options) {
  const { slug, name, main, toast, onChange } = options;

  let tier = TIERS.FREE;
  let payload = null;
  let early = false;
  let unlocked = false;

  /** Renders the panel that explains the paid tier and takes a key. */
  function showPanel(feature) {
    clear(main);

    const panel = el('section', 'upgrade');

    // An unlocked build has nothing to sell and no key to manage. Saying so is
    // the only honest thing to render here.
    if (unlocked) {
      panel.appendChild(el('h2', 'upgrade__title', 'Everything is unlocked'));
      panel.appendChild(
        el(
          'p',
          'upgrade__text',
          'This build ships every feature. No account, no licence, no paid tier.'
        )
      );

      const list = el('ul', 'upgrade__list');
      for (const item of featuresFor(slug).pro) list.appendChild(el('li', null, label(item)));
      panel.appendChild(list);

      main.appendChild(panel);
      return;
    }

    panel.appendChild(
      el(
        'h2',
        'upgrade__title',
        tier === TIERS.PRO
          ? name + ' Pro'
          : STORE_LIVE
            ? feature
              ? label(feature) + ' is a Pro feature'
              : name + ' Pro'
            : 'Pro is coming'
      )
    );

    panel.appendChild(
      el(
        'p',
        'upgrade__text',
        tier === TIERS.PRO
          ? 'Pro is active on this device.'
          : 'Everything you can see on screen stays free. Pro will add:'
      )
    );

    if (tier !== TIERS.PRO) {
      const list = el('ul', 'upgrade__list');
      for (const item of featuresFor(slug).pro) {
        list.appendChild(el('li', null, label(item)));
      }
      panel.appendChild(list);

      const buy = el('a', 'btn upgrade__buy', STORE_LIVE ? 'Get a license' : 'Tell me when it lands');
      buy.href = STORE_URL;
      buy.target = '_blank';
      buy.rel = 'noreferrer noopener';
      panel.appendChild(buy);

      if (!STORE_LIVE) {
        panel.appendChild(
          el(
            'p',
            'upgrade__text',
            'It is not on sale yet. Nothing you use today will move behind it.'
          )
        );
      }
    }

    const form = el('form', 'license');

    if (tier === TIERS.PRO) {
      panel.appendChild(
        el(
          'p',
          'upgrade__text',
          early
            ? 'Yours free, for good - you installed this before Pro existed.'
            : payload && payload.sub
              ? 'Licensed to ' + payload.sub
              : ''
        )
      );

      // An early-adopter unlock has no key to remove.
      if (early) {
        main.appendChild(panel);
        return;
      }

      const remove = el('button', 'btn', 'Remove license');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        await clearLicense();
        tier = TIERS.FREE;
        payload = null;
        toast('License removed');
        if (onChange) onChange();
      });
      panel.appendChild(remove);
    } else {
      const input = el('textarea', 'license__input');
      input.placeholder = 'Paste your license key';
      input.rows = 3;
      input.spellcheck = false;
      form.appendChild(input);

      const submit = el('button', 'btn', 'Activate');
      submit.type = 'submit';
      form.appendChild(submit);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;

        const result = await saveLicense(input.value, LICENSE_PUBLIC_KEY, slug);
        submit.disabled = false;

        if (!result.valid) {
          toast(result.reason);
          return;
        }

        tier = TIERS.PRO;
        payload = result.payload;
        toast('Pro activated');
        if (onChange) onChange();
      });

      panel.appendChild(form);
    }

    main.appendChild(panel);
  }

  return {
    /** Reads any stored license and stamps the install date. Never throws. */
    async load() {
      await rememberInstall();

      const entitlements = await loadEntitlements(LICENSE_PUBLIC_KEY, slug);
      tier = entitlements.tier;
      payload = entitlements.payload;
      early = Boolean(entitlements.early);
      unlocked = Boolean(entitlements.unlocked);
      return tier;
    },

    tier: () => tier,
    isPro: () => tier === TIERS.PRO,
    can: (feature) => can(slug, feature, tier),
    limit: () => rowLimit(tier),
    showPanel,

    /** Whether a gated feature shows a free sample rather than nothing at all. */
    previewable: (feature) => previewCount(slug, feature, tier, 1) > 0,

    /**
     * Splits a gated list into the part free users may see and the rest.
     *
     * @param {string} feature
     * @param {Array} items
     * @returns {{shown: Array, hidden: number, locked: boolean}}
     *          `locked` means nothing at all may be shown.
     */
    preview(feature, items) {
      const list = Array.isArray(items) ? items : [];
      const allowed = previewCount(slug, feature, tier, list.length);
      return {
        shown: list.slice(0, allowed),
        hidden: list.length - allowed,
        locked: list.length > 0 && allowed === 0,
      };
    },

    /**
     * The "N more in Pro" row that closes a truncated list. Clicking it opens
     * the panel, so the lock always explains itself.
     *
     * @returns {HTMLElement|null} null when nothing is hidden.
     */
    lockNotice(feature, hidden) {
      if (!hidden || hidden < 1) return null;

      const notice = el('button', 'locked');
      notice.type = 'button';
      notice.appendChild(el('span', 'locked__count', hidden + ' more'));
      notice.appendChild(
        el('span', 'locked__label', STORE_LIVE ? 'Unlock with Pro' : 'Coming with Pro')
      );
      notice.addEventListener('click', () => showPanel(feature));
      return notice;
    },

    /**
     * Wraps an action behind a feature gate.
     * On the free tier the action is replaced by the upgrade panel, so a locked
     * button explains itself instead of silently doing nothing.
     */
    require(feature, action) {
      return (...args) => {
        if (can(slug, feature, tier)) return action(...args);
        showPanel(feature);
        return undefined;
      };
    },

    /** A header badge: "Pro" when licensed, a button to the panel when not. */
    badge() {
      if (tier === TIERS.PRO) return el('span', 'pill pill--ok', 'Pro');

      const button = el('button', 'pill pill--info', 'Pro');
      button.type = 'button';
      button.title = 'See what Pro adds';
      button.addEventListener('click', () => showPanel(null));
      return button;
    },
  };
}
