/**
 * Report formatting.
 *
 * Pure functions: findings in, text out. Kept separate from the audit rules so
 * that "what is wrong" and "how we say it" can change independently, and so
 * both stay unit-testable without a DOM.
 */

import { GROUPS, STATUS } from './audit.js';

const TOOL = 'SEO Inspector';

const MARKER = {
  [STATUS.OK]: 'OK',
  [STATUS.WARNING]: 'WARN',
  [STATUS.ERROR]: 'FAIL',
  [STATUS.INFO]: 'INFO',
};

/** Collapses a multi-line value onto one line so table-less Markdown stays readable. */
function oneLine(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s*\n\s*/g, ' / ').trim();
}

/**
 * Renders the audit as a Markdown report, suitable for pasting into an issue.
 *
 * @param {object} data   Collected page data.
 * @param {object} audit  Result of auditPage().
 * @returns {string}
 */
export function toMarkdown(data, audit) {
  if (!data || !audit) throw new TypeError('toMarkdown() requires page data and an audit.');

  const { findings, summary } = audit;
  const lines = [];

  lines.push('# ' + TOOL + ' report');
  lines.push('');
  lines.push('- **URL:** ' + (data.url || 'unknown'));
  lines.push('- **Title:** ' + (data.title || '(none)'));
  lines.push('- **Audited:** ' + (data.collectedAt || new Date().toISOString()));
  lines.push(
    '- **Result:** ' + summary.error + ' error(s), ' +
    summary.warning + ' warning(s), ' + summary.ok + ' passing'
  );
  lines.push('');

  for (const group of GROUPS) {
    const rows = findings.filter((item) => item.group === group.id);
    if (!rows.length) continue;

    lines.push('## ' + group.label);
    lines.push('');
    for (const row of rows) {
      lines.push('- **[' + (MARKER[row.status] || '-') + '] ' + row.label + '** - ' + row.message);
      const value = oneLine(row.value);
      if (value) lines.push('  - `' + value + '`');
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Generated locally by ' + TOOL + '. No data left the browser.');

  return lines.join('\n');
}

/**
 * Renders the full audit as pretty-printed JSON, for tooling or diffing.
 *
 * @param {object} data   Collected page data.
 * @param {object} audit  Result of auditPage().
 * @returns {string}
 */
export function toJson(data, audit) {
  if (!data || !audit) throw new TypeError('toJson() requires page data and an audit.');

  return JSON.stringify(
    {
      tool: TOOL,
      version: 1,
      url: data.url || null,
      auditedAt: data.collectedAt || new Date().toISOString(),
      summary: audit.summary,
      findings: audit.findings,
      page: data,
    },
    null,
    2
  );
}
