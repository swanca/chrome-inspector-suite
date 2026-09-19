/**
 * Minimal DOM helpers shared by every popup in this repository.
 *
 * Deliberately not a framework: these exist so the popups never build markup by
 * string concatenation, which is how extensions grow XSS holes when they render
 * text taken from the inspected page.
 */

/**
 * Creates an element. `textContent` is always set as text, never as HTML.
 *
 * @param {string} tag
 * @param {string} [className]
 * @param {*}      [textContent]
 * @returns {HTMLElement}
 */
export function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined && textContent !== null) {
    node.textContent = String(textContent);
  }
  return node;
}

/** Removes every child of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Wires a toast element and returns the function that shows messages in it.
 *
 * @param {HTMLElement} node
 * @param {number} [duration] Milliseconds the toast stays visible.
 * @returns {(message: string) => void}
 */
export function createToast(node, duration = 1800) {
  let timer = null;
  return (message) => {
    node.textContent = message;
    node.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      node.hidden = true;
    }, duration);
  };
}

/**
 * Replaces a container's contents with a centred message.
 *
 * @param {HTMLElement} container
 * @param {string} message
 * @param {string} [hint]
 * @param {'loading'|'error'|'empty'} [variant]
 */
export function showState(container, message, hint, variant = 'empty') {
  clear(container);
  const paragraph = el('p', 'state state--' + variant, message);
  if (hint) paragraph.appendChild(el('span', 'state__hint', hint));
  container.appendChild(paragraph);
}

/**
 * A small coloured count badge, e.g. "3 errors".
 *
 * @param {'ok'|'warning'|'error'|'info'} status
 * @param {string} label
 * @returns {HTMLElement}
 */
export function pill(status, label) {
  return el('span', 'pill pill--' + status, label);
}

/**
 * A labelled key/value row.
 *
 * @param {string} label
 * @param {*} value
 * @param {string} [className] Extra class for the value element.
 * @returns {HTMLElement}
 */
export function row(label, value, className) {
  const node = el('div', 'row');
  node.appendChild(el('span', 'row__label', label));
  node.appendChild(el('span', 'row__value' + (className ? ' ' + className : ''), value));
  return node;
}

/**
 * Renders a JSON-compatible value as a collapsible tree.
 * Used by the viewers that display arbitrary page data.
 *
 * @param {*} value
 * @param {string} [key]      Property name to show before the value.
 * @param {number} [depth]    Current depth; nodes deeper than `openTo` start closed.
 * @param {number} [openTo]   Depth to auto-expand to.
 * @returns {HTMLElement}
 */
export function jsonTree(value, key, depth = 0, openTo = 1) {
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === 'object';

  if (!isObject) {
    const leaf = el('div', 'tree__leaf');
    if (key !== undefined) leaf.appendChild(el('span', 'tree__key', key + ':'));
    leaf.appendChild(el('span', 'tree__value tree__value--' + typeName(value), display(value)));
    return leaf;
  }

  const entries = isArray
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);

  const details = el('details', 'tree__node');
  details.open = depth < openTo;

  const summary = el('summary', 'tree__summary');
  if (key !== undefined) summary.appendChild(el('span', 'tree__key', key + ':'));
  summary.appendChild(
    el('span', 'tree__meta', (isArray ? 'Array' : 'Object') + '(' + entries.length + ')')
  );
  details.appendChild(summary);

  const children = el('div', 'tree__children');
  for (const [childKey, childValue] of entries) {
    children.appendChild(jsonTree(childValue, childKey, depth + 1, openTo));
  }
  details.appendChild(children);

  return details;
}

function typeName(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function display(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return '"' + value + '"';
  return String(value);
}

/**
 * Stamps the extension's version into the popup header.
 *
 * Visible on purpose: after a reload in chrome://extensions it is the quickest
 * way to confirm the new code is actually running.
 *
 * @param {HTMLElement} container Usually the .brand element.
 */
export function showVersion(container) {
  if (!container) return;
  try {
    container.appendChild(el('span', 'version', 'v' + chrome.runtime.getManifest().version));
  } catch {
    // Outside an extension context there is no manifest; showing nothing is fine.
  }
}
