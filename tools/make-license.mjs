/**
 * Signs a license key.
 *
 * Run this when a sale completes - by hand at first, or from a payment
 * provider's webhook later. The output is the key the buyer pastes into the
 * extension. Nothing about this step touches the extension or any server it
 * talks to, because there is no server.
 *
 * Usage:
 *   node tools/make-license.mjs --email buyer@example.com
 *   node tools/make-license.mjs --email buyer@example.com --scope link-extractor
 *   node tools/make-license.mjs --email buyer@example.com --years 1
 *
 * Options:
 *   --email <address>   Who the license is for. Required.
 *   --scope <slug>      One extension, or "suite" (default) for all of them.
 *   --years <n>         Expiry in years. Omit for a perpetual license.
 *   --id <string>       License id. Defaults to a random one.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS } from './extensions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE_PATH = join(ROOT, '.keys', 'private.jwk.json');

function arg(name) {
  const index = process.argv.indexOf('--' + name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

const email = arg('email');
const scope = arg('scope') || 'suite';
const years = arg('years');
const id = arg('id') || 'lic_' + Math.random().toString(36).slice(2, 10);

if (!email) {
  console.error('Missing --email. See the usage notes at the top of this file.');
  process.exit(1);
}

const slugs = EXTENSIONS.map((extension) => extension.slug);
if (scope !== 'suite' && !slugs.includes(scope)) {
  console.error('Unknown --scope "' + scope + '". Use "suite" or one of:');
  for (const slug of slugs) console.error('  ' + slug);
  process.exit(1);
}

if (!existsSync(PRIVATE_PATH)) {
  console.error('No private key. Run: node tools/make-keypair.mjs');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const payload = {
  v: 1,
  id,
  sub: email,
  scope,
  plan: 'pro',
  iat: now,
  exp: years ? now + Math.round(Number(years) * 365.25 * 24 * 3600) : null,
};

const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const privateKey = await crypto.subtle.importKey(
  'jwk',
  JSON.parse(readFileSync(PRIVATE_PATH, 'utf8')),
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['sign']
);

const signed = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));

const signature = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  privateKey,
  new TextEncoder().encode(signed)
);

const key = signed + '.' + toBase64Url(new Uint8Array(signature));

console.log('Licensee : ' + email);
console.log('Scope    : ' + scope);
console.log('Expires  : ' + (payload.exp ? new Date(payload.exp * 1000).toISOString() : 'never'));
console.log('');
console.log(key);
