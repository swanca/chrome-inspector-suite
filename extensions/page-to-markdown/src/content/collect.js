/**
 * Document collector.
 *
 * IMPORTANT: this function is serialised with Function.prototype.toString() and
 * injected into the page by chrome.scripting.executeScript(). It must therefore
 * be entirely self-contained: no imports, no references to module scope.
 *
 * It walks the readable part of the page and produces a tree of plain objects -
 * headings, paragraphs, lists, code, quotes, tables and inline runs. It writes
 * no Markdown at all; that is src/lib/markdown.js, where it can be tested.
 *
 * @returns {object}
 */
export function collectDocument() {
  const MAX_DEPTH = 24;
  const MAX_BLOCKS = 4000;

  /** Elements that never carry readable content. */
  const SKIP = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'CANVAS', 'SVG',
    'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'INPUT', 'LABEL',
    'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'DIALOG',
    'VIDEO', 'AUDIO', 'OBJECT', 'EMBED', 'MAP',
  ]);

  /** Tags that flow inside a paragraph rather than starting a new block. */
  const INLINE = new Set([
    'A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DFN', 'EM',
    'I', 'IMG', 'KBD', 'MARK', 'Q', 'RP', 'RT', 'RUBY', 'S', 'SAMP', 'SMALL',
    'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR', 'FONT',
  ]);

  let budget = MAX_BLOCKS;

  const absolute = (href) => {
    if (!href) return '';
    try {
      return new URL(href, document.baseURI).href;
    } catch {
      return '';
    }
  };

  const hidden = (element) => {
    if (element.hasAttribute('hidden')) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden';
  };

  // --- Inline ----------------------------------------------------------------

  function inlineOf(element) {
    const out = [];

    for (const node of element.childNodes) {
      if (node.nodeType === 3) {
        if (node.nodeValue) out.push({ type: 'text', text: node.nodeValue });
        continue;
      }
      if (node.nodeType !== 1) continue;

      const tag = node.tagName;
      if (SKIP.has(tag)) continue;

      if (tag === 'BR') {
        out.push({ type: 'br' });
      } else if (tag === 'STRONG' || tag === 'B') {
        out.push({ type: 'strong', children: inlineOf(node) });
      } else if (tag === 'EM' || tag === 'I') {
        out.push({ type: 'em', children: inlineOf(node) });
      } else if (tag === 'S' || tag === 'DEL') {
        out.push({ type: 'strike', children: inlineOf(node) });
      } else if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') {
        out.push({ type: 'code', text: node.textContent || '' });
      } else if (tag === 'A') {
        out.push({
          type: 'link',
          href: absolute(node.getAttribute('href')),
          children: inlineOf(node),
        });
      } else if (tag === 'IMG') {
        out.push({
          type: 'image',
          src: absolute(node.getAttribute('src')),
          alt: (node.getAttribute('alt') || '').trim(),
        });
      } else {
        // Any other inline wrapper contributes its children, not itself.
        for (const child of inlineOf(node)) out.push(child);
      }
    }

    return out;
  }

  const hasText = (nodes) =>
    nodes.some(
      (node) =>
        (node.type === 'text' && node.text.trim()) ||
        node.type === 'image' ||
        node.type === 'code' ||
        (node.children && hasText(node.children))
    );

  // --- Blocks ----------------------------------------------------------------

  function tableRows(table) {
    const rows = [];
    for (const row of table.rows) {
      const cells = [];
      for (const cell of row.cells) {
        cells.push(String(cell.textContent || '').replace(/\s+/g, ' ').trim());
      }
      rows.push(cells);
      if (rows.length >= 200) break;
    }
    return rows;
  }

  function listOf(element, depth) {
    const items = [];
    for (const child of element.children) {
      if (child.tagName !== 'LI') continue;
      items.push({ blocks: blocksOf(child, depth + 1) });
      if (items.length >= 500) break;
    }
    return {
      type: 'list',
      ordered: element.tagName === 'OL',
      start: element.tagName === 'OL' ? Number(element.getAttribute('start')) || 1 : 1,
      items,
    };
  }

  function codeOf(element) {
    const code = element.querySelector('code');
    const source = code || element;
    const classes = (source.getAttribute('class') || '') + ' ' + (element.getAttribute('class') || '');
    const match = classes.match(/(?:language|lang|highlight)-([a-z0-9+#-]+)/i);

    return { type: 'code-block', lang: match ? match[1].toLowerCase() : '', text: source.textContent || '' };
  }

  function blocksOf(element, depth) {
    const out = [];
    if (depth > MAX_DEPTH || budget <= 0) return out;

    let buffer = [];
    const flush = () => {
      if (buffer.length && hasText(buffer)) {
        out.push({ type: 'paragraph', children: buffer });
        budget--;
      }
      buffer = [];
    };

    for (const node of element.childNodes) {
      if (budget <= 0) break;

      if (node.nodeType === 3) {
        if (node.nodeValue) buffer.push({ type: 'text', text: node.nodeValue });
        continue;
      }
      if (node.nodeType !== 1) continue;

      const tag = node.tagName;
      if (SKIP.has(tag) || hidden(node)) continue;

      if (INLINE.has(tag)) {
        for (const child of inlineOf(node)) buffer.push(child);
        continue;
      }

      flush();

      if (/^H[1-6]$/.test(tag)) {
        const children = inlineOf(node);
        if (hasText(children)) {
          out.push({ type: 'heading', level: Number(tag.slice(1)), children });
          budget--;
        }
      } else if (tag === 'P') {
        const children = inlineOf(node);
        if (hasText(children)) {
          out.push({ type: 'paragraph', children });
          budget--;
        }
      } else if (tag === 'UL' || tag === 'OL') {
        out.push(listOf(node, depth));
        budget--;
      } else if (tag === 'PRE') {
        out.push(codeOf(node));
        budget--;
      } else if (tag === 'BLOCKQUOTE') {
        out.push({ type: 'quote', blocks: blocksOf(node, depth + 1) });
        budget--;
      } else if (tag === 'HR') {
        out.push({ type: 'hr' });
        budget--;
      } else if (tag === 'TABLE') {
        out.push({ type: 'table', rows: tableRows(node) });
        budget--;
      } else if (tag === 'FIGURE') {
        const image = node.querySelector('img');
        const caption = node.querySelector('figcaption');
        if (image) {
          out.push({
            type: 'figure',
            src: absolute(image.getAttribute('src')),
            alt: (image.getAttribute('alt') || '').trim(),
            caption: caption ? String(caption.textContent || '').trim() : '',
          });
          budget--;
        } else {
          for (const block of blocksOf(node, depth + 1)) out.push(block);
        }
      } else {
        // Structural wrapper: descend.
        for (const block of blocksOf(node, depth + 1)) out.push(block);
      }
    }

    flush();
    return out;
  }

  // --- Root selection --------------------------------------------------------

  const candidates = ['article', 'main', '[role="main"]', '#content', '.post', 'body'];
  let root = null;
  let rootSelector = 'body';

  for (const selector of candidates) {
    const found = document.querySelector(selector);
    if (found && (found.innerText || '').trim().length > 200) {
      root = found;
      rootSelector = selector;
      break;
    }
  }
  if (!root) {
    root = document.body;
    rootSelector = 'body';
  }

  const heading = document.querySelector('h1');

  return {
    url: location.href,
    title: (document.title || '').trim(),
    heading: heading ? String(heading.textContent || '').replace(/\s+/g, ' ').trim() : '',
    description: (() => {
      const meta = document.querySelector('meta[name="description"]');
      return meta ? (meta.getAttribute('content') || '').trim() : '';
    })(),
    rootSelector,
    blocks: root ? blocksOf(root, 0) : [],
    truncated: budget <= 0,
    collectedAt: new Date().toISOString(),
  };
}
