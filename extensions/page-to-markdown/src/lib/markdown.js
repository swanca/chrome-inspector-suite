/**
 * Markdown renderer.
 *
 * Pure functions: the block tree produced by src/content/collect.js in,
 * Markdown text out. No DOM, no chrome.* APIs - which is what makes this file
 * directly unit-testable under Node.
 */

/** Characters that would otherwise start Markdown syntax mid-sentence. */
const INLINE_SPECIALS = /([\\`*_[\]<>])/g;

/**
 * Markers that only mean something at the start of a line.
 *
 * Ordered-list markers are captured separately because the escape has to go
 * before the punctuation, not before the digits: "\1." is not a valid Markdown
 * escape and would render the backslash literally, whereas "1\." is correct.
 */
const LINE_START = /^(\s*)(?:([-+*>#])|(\d+)([.)]))(\s)/;

/**
 * Escapes page text so it survives as literal text in Markdown.
 * @param {string} text
 * @returns {string}
 */
export function escapeText(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(INLINE_SPECIALS, '\\$1')
    .replace(LINE_START, (match, lead, symbol, digits, punctuation, trail) =>
      symbol ? lead + '\\' + symbol + trail : lead + digits + '\\' + punctuation + trail
    );
}

/** Collapses runs of whitespace, the way HTML rendering does. */
function collapse(text) {
  return String(text).replace(/\s+/g, ' ');
}

/** Wraps inline code, widening the fence when the content contains backticks. */
function inlineCode(text) {
  const content = collapse(text).trim();
  if (!content) return '';

  const longest = (content.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : '';

  return fence + pad + content + pad + fence;
}

/**
 * Renders a run of inline nodes.
 *
 * @param {Array<object>} nodes
 * @param {object} [options]
 * @param {boolean} [options.links]  Keep links. Default true.
 * @param {boolean} [options.images] Keep images. Default true.
 * @returns {string}
 */
export function renderInline(nodes, options = {}) {
  if (!Array.isArray(nodes)) return '';

  const keepLinks = options.links !== false;
  const keepImages = options.images !== false;

  let out = '';

  for (const node of nodes) {
    if (!node) continue;

    switch (node.type) {
      case 'text':
        out += escapeText(collapse(node.text));
        break;

      case 'br':
        out += '  \n';
        break;

      case 'code':
        out += inlineCode(node.text);
        break;

      case 'strong': {
        const inner = renderInline(node.children, options).trim();
        if (inner) out += '**' + inner + '**';
        break;
      }

      case 'em': {
        const inner = renderInline(node.children, options).trim();
        if (inner) out += '*' + inner + '*';
        break;
      }

      case 'strike': {
        const inner = renderInline(node.children, options).trim();
        if (inner) out += '~~' + inner + '~~';
        break;
      }

      case 'link': {
        const inner = renderInline(node.children, options).trim();
        if (!inner) break;
        if (!keepLinks || !node.href) out += inner;
        else out += '[' + inner + '](' + encodeUrl(node.href) + ')';
        break;
      }

      case 'image': {
        if (!keepImages || !node.src) break;
        out += '![' + escapeText(node.alt || '') + '](' + encodeUrl(node.src) + ')';
        break;
      }

      default:
        if (node.children) out += renderInline(node.children, options);
    }
  }

  return out;
}

/** Wraps a URL in angle brackets when it contains characters that break link syntax. */
function encodeUrl(url) {
  const value = String(url).trim();
  return /[()\s]/.test(value) ? '<' + value + '>' : value;
}

function renderList(block, options, indent) {
  const lines = [];
  let number = Number(block.start) || 1;

  for (const item of block.items || []) {
    // Each block of the item is rendered flat, then indented by this function,
    // so a nested list simply comes back as lines to push further right.
    const parts = (item.blocks || [])
      .map((child) => ({ type: child && child.type, text: renderBlocks([child], options).trim() }))
      .filter((part) => part.text);

    if (!parts.length) continue;

    let body = parts[0].text;
    for (const part of parts.slice(1)) {
      // A nested list stays tight against its parent item; anything else gets
      // the usual blank line.
      body += (part.type === 'list' ? '\n' : '\n\n') + part.text;
    }

    const marker = block.ordered ? number + '. ' : '- ';
    const pad = ' '.repeat(marker.length);
    const bodyLines = body.split('\n');

    lines.push(indent + marker + bodyLines[0]);
    for (const line of bodyLines.slice(1)) lines.push(line ? indent + pad + line : '');

    number++;
  }

  return lines.join('\n');
}

function renderTable(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';

  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  if (!width) return '';

  const cell = (value) => escapeText(collapse(value || '')).replace(/\|/g, '\\|').trim();
  const pad = (row) => {
    const padded = [];
    for (let i = 0; i < width; i++) padded.push(cell(row[i]));
    return '| ' + padded.join(' | ') + ' |';
  };

  const lines = [pad(rows[0]), '| ' + new Array(width).fill('---').join(' | ') + ' |'];
  for (const row of rows.slice(1)) lines.push(pad(row));

  return lines.join('\n');
}

/**
 * Renders a list of blocks.
 *
 * @param {Array<object>} blocks
 * @param {object} [options]
 * @param {string} [indent] Prefix applied to every line, used by lists and quotes.
 * @returns {string}
 */
export function renderBlocks(blocks, options = {}, indent = '') {
  if (!Array.isArray(blocks)) return '';

  const chunks = [];

  for (const block of blocks) {
    if (!block) continue;
    let text = '';

    switch (block.type) {
      case 'heading': {
        const inner = renderInline(block.children, options).trim();
        const level = Math.min(6, Math.max(1, Number(block.level) || 1));
        if (inner) text = '#'.repeat(level) + ' ' + inner;
        break;
      }

      case 'paragraph':
        text = renderInline(block.children, options).trim();
        break;

      case 'list':
        text = renderList(block, options, indent);
        break;

      case 'code-block': {
        const body = String(block.text || '').replace(/\s+$/, '');
        if (!body.trim()) break;
        const longest = (body.match(/`{3,}/g) || []).reduce((m, r) => Math.max(m, r.length), 2);
        const fence = '`'.repeat(longest + 1);
        text = fence + (block.lang || '') + '\n' + body + '\n' + fence;
        break;
      }

      case 'quote': {
        const body = renderBlocks(block.blocks || [], options).trim();
        if (!body) break;
        text = body
          .split('\n')
          .map((line) => (line ? '> ' + line : '>'))
          .join('\n');
        break;
      }

      case 'hr':
        text = '---';
        break;

      case 'table':
        text = renderTable(block.rows);
        break;

      case 'figure': {
        if (options.images === false || !block.src) break;
        text = '![' + escapeText(block.alt || '') + '](' + encodeUrl(block.src) + ')';
        if (block.caption) text += '\n\n*' + escapeText(collapse(block.caption).trim()) + '*';
        break;
      }

      default:
        break;
    }

    if (!text.trim()) continue;

    // Lists already carry their own indentation, line by line.
    chunks.push(
      block.type === 'list' || !indent
        ? text
        : text
            .split('\n')
            .map((line) => (line ? indent + line : line))
            .join('\n')
    );
  }

  return chunks.join('\n\n');
}

/**
 * Renders a whole collected document.
 *
 * @param {object} doc Output of collectDocument().
 * @param {object} [options]
 * @param {boolean} [options.links]       Keep links. Default true.
 * @param {boolean} [options.images]      Keep images. Default true.
 * @param {boolean} [options.frontMatter] Prepend YAML front matter. Default false.
 * @returns {string}
 * @throws {TypeError} If doc is not an object.
 */
export function renderMarkdown(doc, options = {}) {
  if (!doc || typeof doc !== 'object') {
    throw new TypeError('renderMarkdown() requires the collected document.');
  }

  const parts = [];
  const title = (doc.heading || doc.title || '').trim();

  // The page's own H1 is usually inside the extracted blocks. Emitting the
  // title as well would duplicate it, so the title only leads when the body
  // does not already open with the same heading.
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  const first = blocks.find((block) => block && block.type !== 'figure');
  const bodyOpensWithTitle =
    first &&
    first.type === 'heading' &&
    renderInline(first.children, options).trim().toLowerCase() ===
      escapeText(title).trim().toLowerCase();

  if (options.frontMatter) {
    const quote = (value) => '"' + String(value).replace(/"/g, '\\"') + '"';
    const lines = ['---', 'title: ' + quote(title)];
    if (doc.url) lines.push('source: ' + quote(doc.url));
    if (doc.description) lines.push('description: ' + quote(doc.description));
    if (doc.collectedAt) lines.push('captured: ' + quote(doc.collectedAt));
    lines.push('---');
    parts.push(lines.join('\n'));
  } else if (title && !bodyOpensWithTitle) {
    parts.push('# ' + escapeText(title));
  }

  const body = renderBlocks(blocks, options);
  if (body) parts.push(body);

  if (!parts.length) return '';

  // Never emit more than one blank line in a row.
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
