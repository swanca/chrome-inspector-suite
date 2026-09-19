/**
 * Copy and export helpers shared by every extension in this repository.
 *
 * `exportFilename`, `toCsv` and `escapeCsvField` are pure and unit-tested;
 * `copyText` and `downloadText` touch browser APIs.
 */

/**
 * Builds a filesystem-safe export filename,
 * e.g. "link-extractor-example-com-2026-09-19.csv".
 *
 * @param {string} prefix    Extension slug.
 * @param {string} url       The inspected page URL.
 * @param {string} extension Extension without the dot.
 * @param {Date}   [now]     Injectable for deterministic tests.
 * @returns {string}
 */
export function exportFilename(prefix, url, extension, now = new Date()) {
  let host = 'page';
  try {
    host = new URL(url).hostname || 'page';
  } catch {
    // Keep the fallback: a bad URL must not break the download.
  }

  const clean = (value, fallback) => {
    const safe = String(value)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return safe || fallback;
  };

  const safeExtension = String(extension).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'txt';

  return (
    clean(prefix, 'export') +
    '-' +
    clean(host, 'page') +
    '-' +
    now.toISOString().slice(0, 10) +
    '.' +
    safeExtension
  );
}

/**
 * Escapes one CSV field.
 *
 * Two separate concerns are handled here:
 *
 * 1. RFC 4180 quoting - fields containing the delimiter, a quote, a newline or
 *    edge whitespace are wrapped in quotes, and inner quotes are doubled.
 * 2. Formula injection - a field starting with =, +, - or @ is executed as a
 *    formula when the CSV is opened in Excel, Sheets or LibreOffice. Since these
 *    values come from an untrusted web page, such fields are prefixed with an
 *    apostrophe so they are read as text.
 *
 * @param {*} value
 * @param {string} [delimiter]
 * @returns {string}
 */
export function escapeCsvField(value, delimiter = ',') {
  if (value === null || value === undefined) return '';

  let field = String(value);

  if (/^[=+\-@\t\r]/.test(field)) field = "'" + field;

  const mustQuote =
    field.includes(delimiter) ||
    field.includes('"') ||
    /[\r\n]/.test(field) ||
    field !== field.trim();

  if (mustQuote) return '"' + field.replace(/"/g, '""') + '"';
  return field;
}

/**
 * Renders a grid of values as CSV text.
 *
 * @param {Array<Array<*>>} rows       Including the header row, if any.
 * @param {object} [options]
 * @param {string} [options.delimiter] ',' (default), ';' or '\t'.
 * @param {boolean} [options.bom]      Prepend a UTF-8 BOM so Excel reads accents
 *                                     correctly. Defaults to true.
 * @returns {string}
 */
export function toCsv(rows, options = {}) {
  if (!Array.isArray(rows)) throw new TypeError('toCsv() requires an array of rows.');

  const delimiter = options.delimiter || ',';
  const bom = options.bom === undefined ? true : options.bom;

  const body = rows
    .map((row) =>
      (Array.isArray(row) ? row : [row])
        .map((cell) => escapeCsvField(cell, delimiter))
        .join(delimiter)
    )
    .join('\r\n');

  return (bom ? '﻿' : '') + body;
}

/**
 * Copies text to the clipboard, falling back to the legacy path when the
 * async Clipboard API is refused.
 *
 * @param {string} text
 * @returns {Promise<boolean>} Whether the copy succeeded.
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

/**
 * Hands the user a file. The object URL is revoked once the download has
 * certainly started.
 *
 * @param {string} text
 * @param {string} filename
 * @param {string} [mimeType]
 * @returns {boolean} Whether the download was started.
 */
export function downloadText(text, filename, mimeType = 'text/plain') {
  let url;
  try {
    url = URL.createObjectURL(new Blob([text], { type: mimeType + ';charset=utf-8' }));

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
