const test = require('node:test');
const assert = require('node:assert/strict');

const { selectHibernateCandidates } = require('../src/main/hibernation-policy');

test('LRU policy keeps the current view and the most recently used loaded views', () => {
  const views = [
    { key: 'current', state: 'active', lastActive: 900 },
    { key: 'recent', state: 'idle', lastActive: 800 },
    { key: 'middle', state: 'idle', lastActive: 700 },
    { key: 'old', state: 'idle', lastActive: 100 }
  ];

  const candidates = selectHibernateCandidates(views, {
    activeKey: 'current',
    maxActiveTabs: 3,
    idleTimeout: 500,
    now: 1000
  });

  assert.deepEqual(candidates, ['old']);
});
