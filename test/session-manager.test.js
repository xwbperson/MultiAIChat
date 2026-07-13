const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveProxy } = require('../src/main/session-manager');

test('site proxy overrides the default and empty sites inherit the selected default', () => {
  assert.equal(
    resolveProxy('socks5://127.0.0.1:1080', {
      defaultProxyMode: 'custom',
      defaultProxy: 'http://127.0.0.1:7890'
    }),
    'socks5://127.0.0.1:1080'
  );
  assert.equal(
    resolveProxy('', {
      defaultProxyMode: 'custom',
      defaultProxy: 'http://127.0.0.1:7890'
    }),
    'http://127.0.0.1:7890'
  );
  assert.equal(resolveProxy('', { defaultProxyMode: 'system' }), 'system');
  assert.equal(resolveProxy('', { defaultProxyMode: 'direct' }), 'direct');
});
