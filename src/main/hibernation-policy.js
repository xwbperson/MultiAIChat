function selectHibernateCandidates(views, options) {
  const now = options.now ?? Date.now();
  const idleTimeout = Math.max(0, Number(options.idleTimeout) || 0);
  const maxActiveTabs = Math.max(1, Number(options.maxActiveTabs) || 1);
  const loaded = views.filter(view => ['active', 'idle', 'loading'].includes(view.state));
  const protectedKeys = new Set();

  const current = loaded.find(view => view.key === options.activeKey)
    || loaded.find(view => view.state === 'active');
  if (current) protectedKeys.add(current.key);

  const remainingSlots = Math.max(0, maxActiveTabs - protectedKeys.size);
  loaded
    .filter(view => !protectedKeys.has(view.key))
    .sort((left, right) => right.lastActive - left.lastActive)
    .slice(0, remainingSlots)
    .forEach(view => protectedKeys.add(view.key));

  return loaded
    .filter(view => view.state === 'idle')
    .filter(view => !protectedKeys.has(view.key))
    .filter(view => now - view.lastActive >= idleTimeout)
    .sort((left, right) => left.lastActive - right.lastActive)
    .map(view => view.key);
}

module.exports = { selectHibernateCandidates };
