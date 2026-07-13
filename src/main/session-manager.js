const { session } = require('electron');

const sessions = new Map();
const proxyConfigurations = new Map();

function resolveProxy(siteProxy, settings = {}) {
  if (siteProxy) return siteProxy;
  if (settings.defaultProxyMode === 'custom') {
    if (!settings.defaultProxy) throw new Error('Custom default proxy address is missing');
    return settings.defaultProxy;
  }
  return settings.defaultProxyMode === 'direct' ? 'direct' : 'system';
}

function getSession(partition) {
  if (!sessions.has(partition)) {
    const ses = session.fromPartition(partition);
    sessions.set(partition, ses);
  }
  return sessions.get(partition);
}

async function setProxy(partition, proxyConfig) {
  const ses = getSession(partition);
  if (proxyConfigurations.get(partition) === proxyConfig) return;

  if (!proxyConfig || proxyConfig === 'direct') {
    await ses.setProxy({ mode: 'direct' });
  } else if (proxyConfig === 'system') {
    await ses.setProxy({ mode: 'system' });
  } else if (proxyConfig.startsWith('socks')) {
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: proxyConfig
    });
  } else {
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http=${proxyConfig};https=${proxyConfig}`
    });
  }
  await ses.closeAllConnections?.();
  proxyConfigurations.set(partition, proxyConfig);
}

async function clearSessionData(partition) {
  const ses = getSession(partition);
  await ses.closeAllConnections?.();
  if (typeof ses.clearData === 'function') {
    await ses.clearData();
  } else {
    await Promise.all([ses.clearStorageData(), ses.clearCache()]);
  }
  sessions.delete(partition);
  proxyConfigurations.delete(partition);
}

module.exports = { getSession, setProxy, clearSessionData, resolveProxy };
