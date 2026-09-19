/**
 * Static checks that catch the mistakes unit tests cannot see, across every
 * extension at once:
 *
 *  - manifest is valid MV3, and every file it points at exists
 *  - the Web Store description fits in 132 characters
 *  - no permission beyond the declared minimum
 *  - every getElementById target exists in the popup markup
 *  - every CSS class used by markup or script has a rule
 *  - no inline <script> (forbidden by the MV3 content security policy)
 *  - popup.js loads as a module, and each of its imports resolves
 *  - injected collectors are self-contained, as executeScript requires
 *
 * Usage: node tools/check-extensions.mjs [slug]
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS } from './extensions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_PERMISSIONS = new Set(['activeTab', 'scripting', 'storage']);

let failures = 0;

function fail(slug, message) {
  console.log('  FAIL  [' + slug + '] ' + message);
  failures++;
}

function checkManifest(slug, dir) {
  const path = join(dir, 'manifest.json');
  if (!existsSync(path)) return fail(slug, 'manifest.json missing');

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(slug, 'manifest.json is not valid JSON: ' + error.message);
  }

  if (manifest.manifest_version !== 3) fail(slug, 'manifest_version must be 3');
  if (!manifest.name) fail(slug, 'manifest has no name');
  if (!manifest.description) fail(slug, 'manifest has no description');
  else if (manifest.description.length > 132) {
    fail(slug, 'description is ' + manifest.description.length + ' chars (Web Store max 132)');
  }

  for (const permission of manifest.permissions || []) {
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      fail(slug, 'unexpected permission "' + permission + '"');
    }
  }
  if (manifest.host_permissions) fail(slug, 'host_permissions should not be needed');

  const referenced = new Set(Object.values(manifest.icons || {}));
  for (const icon of Object.values((manifest.action || {}).default_icon || {})) {
    referenced.add(icon);
  }
  if (manifest.action && manifest.action.default_popup) {
    referenced.add(manifest.action.default_popup);
  }

  for (const file of referenced) {
    if (!existsSync(join(dir, file))) fail(slug, 'manifest points at missing file ' + file);
  }

  return manifest;
}

function checkPopup(slug, dir, manifest) {
  const popupPath = manifest && manifest.action && manifest.action.default_popup;
  if (!popupPath) return;

  const popupDir = join(dir, dirname(popupPath));
  const htmlPath = join(dir, popupPath);
  if (!existsSync(htmlPath)) return; // Already reported by checkManifest.

  const html = readFileSync(htmlPath, 'utf8');

  const scriptMatch = html.match(/<script[^>]*src="([^"]+)"[^>]*>/);
  if (!scriptMatch) return fail(slug, 'popup has no external script');
  if (!/type="module"/.test(scriptMatch[0])) {
    fail(slug, 'popup script must be loaded with type="module"');
  }

  if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/.test(html)) {
    fail(slug, 'inline <script> is blocked by the MV3 content security policy');
  }

  const js = readFileSync(join(popupDir, scriptMatch[1]), 'utf8');

  // Stylesheets and images referenced by the popup must exist.
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = match[1];
    if (/^(https?:|data:|#)/.test(reference)) continue;
    if (!existsSync(join(popupDir, reference))) {
      fail(slug, 'popup references missing file ' + reference);
    }
  }

  // Every import must resolve.
  for (const match of js.matchAll(/from '([^']+)'/g)) {
    if (!existsSync(join(popupDir, match[1]))) {
      fail(slug, 'popup imports unresolved module ' + match[1]);
    }
  }

  // Every getElementById target must exist in the markup.
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const match of js.matchAll(/getElementById\('([^']+)'\)/g)) {
    if (!ids.has(match[1])) fail(slug, 'script looks up #' + match[1] + ', absent from the markup');
  }

  // Every class used must be styled by one of the popup's stylesheets.
  let css = '';
  for (const match of html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)) {
    const path = join(popupDir, match[1]);
    if (existsSync(path)) css += readFileSync(path, 'utf8');
  }
  const styled = new Set([...css.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]));

  const used = new Set();
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const name of match[1].split(/\s+/)) used.add(name);
  }
  for (const match of js.matchAll(/el\('[a-z0-9]+',\s*'([^']+)'/g)) {
    for (const name of match[1].split(/\s+/)) {
      if (!name.endsWith('--')) used.add(name);
    }
  }
  // Modifier classes completed by concatenation, e.g. 'pill--' + status.
  for (const match of js.matchAll(/'([a-zA-Z0-9_-]+--)'\s*\+/g)) {
    for (const status of ['ok', 'warning', 'error', 'info']) used.add(match[1] + status);
  }

  for (const name of [...used].sort()) {
    if (!styled.has(name)) fail(slug, 'class .' + name + ' is used but has no CSS rule');
  }
}

function checkCollectors(slug, dir) {
  const contentDir = join(dir, 'src', 'content');
  if (!existsSync(contentDir)) return;

  for (const file of readdirSync(contentDir).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(contentDir, file), 'utf8');

    // Strip the leading module-level doc comment and the export keyword; what
    // remains must not reach outside the injected function.
    const body = source.replace(/^[\s\S]*?export function/, 'function');

    if (/\bimport\s/.test(body)) {
      fail(slug, 'src/content/' + file + ' imports - it will throw once injected');
    }
    if (/\bchrome\./.test(body)) {
      fail(slug, 'src/content/' + file + ' uses chrome.* - unavailable in the page world');
    }
  }
}

const only = process.argv[2];
const targets = only ? EXTENSIONS.filter((e) => e.slug === only) : EXTENSIONS;

for (const extension of targets) {
  const dir = join(ROOT, 'extensions', extension.slug);

  // scaffold.mjs writes a manifest for every registered extension, so the popup
  // is what actually tells us whether this one has been built yet.
  if (!existsSync(join(dir, 'src', 'popup', 'popup.html'))) {
    console.log('  skip  ' + extension.slug + ' (not built yet)');
    continue;
  }

  const before = failures;
  const manifest = checkManifest(extension.slug, dir);
  checkPopup(extension.slug, dir, manifest);
  checkCollectors(extension.slug, dir);

  if (failures === before) console.log('  ok    ' + extension.slug);
}

console.log('');
if (failures) {
  console.log(failures + ' problem(s) found.');
  process.exit(1);
}
console.log('All checked extensions are consistent.');
