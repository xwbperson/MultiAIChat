const test = require('node:test');
const assert = require('node:assert/strict');
const FaviconCache = require('../src/main/favicon-cache');

function createHarness({ fetchError = null } = {}) {
  let sites = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      faviconUrl: 'https://icons.example/chatgpt.ico',
      proxy: ''
    },
    {
      id: 'emoji-only',
      name: 'Emoji only',
      faviconUrl: null,
      proxy: ''
    }
  ];
  const localUrls = new Map();
  const fetchCalls = [];
  const notifications = [];

  const cache = new FaviconCache({
    getSites: () => structuredClone(sites),
    updateSite: (siteId, patch) => {
      sites = sites.map(site => site.id === siteId ? { ...site, ...patch } : site);
    },
    getLocalUrl: siteId => localUrls.get(siteId) || null,
    fetchAndSave: async (url, siteId, proxy) => {
      fetchCalls.push({ url, siteId, proxy });
      if (fetchError) throw fetchError;
      const localUrl = `file:///favicons/${siteId}.ico`;
      localUrls.set(siteId, localUrl);
      return localUrl;
    },
    resolveProxy: site => site.proxy || 'system',
    onUpdated: update => notifications.push(update)
  });

  return {
    cache,
    fetchCalls,
    notifications,
    getRawSites: () => structuredClone(sites)
  };
}

test('renderer sites expose only saved local favicons and successful warming is persisted', async () => {
  const harness = createHarness();

  assert.equal(harness.cache.getSitesForRenderer()[0].faviconUrl, null);

  const result = await harness.cache.warm();

  assert.deepEqual(result, { cachedSiteIds: ['chatgpt'], failedSiteIds: [] });
  assert.deepEqual(harness.fetchCalls, [{
    url: 'https://icons.example/chatgpt.ico',
    siteId: 'chatgpt',
    proxy: 'system'
  }]);
  assert.equal(harness.getRawSites()[0].faviconUrl, 'file:///favicons/chatgpt.ico');
  assert.equal(
    harness.cache.getSitesForRenderer()[0].faviconUrl,
    'file:///favicons/chatgpt.ico'
  );
  assert.deepEqual(harness.notifications, [{
    reason: 'favicons-cached',
    siteIds: ['chatgpt']
  }]);

  await harness.cache.warm();
  assert.equal(harness.fetchCalls.length, 1);
});

test('failed downloads stay remote in storage for retry but never reach the renderer', async () => {
  const harness = createHarness({ fetchError: new Error('offline') });

  const firstResult = await harness.cache.warm();
  assert.deepEqual(firstResult, { cachedSiteIds: [], failedSiteIds: ['chatgpt'] });
  assert.equal(harness.getRawSites()[0].faviconUrl, 'https://icons.example/chatgpt.ico');
  assert.equal(harness.cache.getSitesForRenderer()[0].faviconUrl, null);
  assert.deepEqual(harness.notifications, []);

  await harness.cache.warm();
  assert.equal(harness.fetchCalls.length, 2);
});
