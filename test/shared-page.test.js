import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeBlockedUrl, BLOCKED_SCHEMES, BLOCKED_HOSTS } from '../shared/page.js';

test('ordinary web pages are not blocked', () => {
  assert.equal(describeBlockedUrl('https://example.com/page'), null);
  assert.equal(describeBlockedUrl('http://localhost:3000/'), null);
  assert.equal(describeBlockedUrl('https://example.com/?q=chrome://x'), null);
});

test('a missing URL is explained rather than crashing', () => {
  const blocked = describeBlockedUrl(undefined);
  assert.ok(blocked);
  assert.match(blocked.message, /No page/i);
  assert.ok(blocked.hint.length > 0);
});

test('an unparseable URL is explained', () => {
  const blocked = describeBlockedUrl('not a url');
  assert.ok(blocked);
  assert.match(blocked.message, /no readable address/i);
});

test('every blocked scheme is rejected', () => {
  for (const scheme of BLOCKED_SCHEMES) {
    const blocked = describeBlockedUrl(scheme + '//whatever');
    assert.ok(blocked, scheme + ' should be blocked');
    assert.match(blocked.message, /does not allow extensions/i);
  }
});

test('file URLs get their own actionable hint', () => {
  const blocked = describeBlockedUrl('file:///C:/tmp/page.html');
  assert.ok(blocked);
  assert.match(blocked.hint, /Allow access to file URLs/);
});

test('every blocked host is rejected', () => {
  for (const host of BLOCKED_HOSTS) {
    const blocked = describeBlockedUrl('https://' + host + '/detail/abc');
    assert.ok(blocked, host + ' should be blocked');
    assert.match(blocked.message, /Web Store/i);
  }
});

test('a lookalike host is not blocked', () => {
  assert.equal(describeBlockedUrl('https://chrome.google.com.evil.test/'), null);
  assert.equal(describeBlockedUrl('https://notchromewebstore.google.com/'), null);
});

test('every blocked result carries both a message and a hint', () => {
  const samples = [undefined, 'not a url', 'chrome://extensions', 'file:///x', 'https://chrome.google.com/'];
  for (const sample of samples) {
    const blocked = describeBlockedUrl(sample);
    assert.ok(blocked);
    assert.equal(typeof blocked.message, 'string');
    assert.equal(typeof blocked.hint, 'string');
    assert.ok(blocked.message.length > 0 && blocked.hint.length > 0);
  }
});
